package worker

import (
	"context"
	"log"
	"strconv"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/internal/whatsapp"
	"whatapps/backend/pkg/database"
	rdb "whatapps/backend/pkg/redis"

	"github.com/redis/go-redis/v9"
)

type QueueWorker struct {
	redisClient *redis.Client
	ctx         context.Context
	cancel      context.CancelFunc
}

func NewQueueWorker(redisClient *redis.Client) *QueueWorker {
	ctx, cancel := context.WithCancel(context.Background())
	return &QueueWorker{
		redisClient: redisClient,
		ctx:         ctx,
		cancel:      cancel,
	}
}

func (qw *QueueWorker) Start() {
	log.Println("Starting message queue worker...")

	go func() {
		for {
			select {
			case <-qw.ctx.Done():
				log.Println("Queue worker stopped")
				return
			default:
				// Read new messages from the stream
				streams, err := qw.redisClient.XReadGroup(qw.ctx, &redis.XReadGroupArgs{
					Group:    rdb.MessageQueueGroup,
					Consumer: "worker_node_1",
					Streams:  []string{rdb.MessageQueueStream, ">"},
					Count:    1,
					Block:    2 * time.Second,
				}).Result()

				if err != nil {
					if err == redis.Nil {
						// Timeout blocking, try again
						continue
					}
					log.Printf("Error reading from stream: %v", err)
					time.Sleep(2 * time.Second)
					continue
				}

				for _, stream := range streams {
					for _, message := range stream.Messages {
						qw.processStreamMessage(message)
					}
				}
			}
		}
	}()
}

func (qw *QueueWorker) Stop() {
	qw.cancel()
}

func (qw *QueueWorker) processStreamMessage(streamMsg redis.XMessage) {
	msgIDStr, ok := streamMsg.Values["message_id"].(string)
	if !ok {
		log.Printf("Invalid message payload in stream: %v", streamMsg.Values)
		qw.ackMessage(streamMsg.ID)
		return
	}

	msgID, err := strconv.ParseUint(msgIDStr, 10, 64)
	if err != nil {
		log.Printf("Failed to parse message ID: %v", err)
		qw.ackMessage(streamMsg.ID)
		return
	}

	// 1. Fetch message from DB
	var msg model.Message
	if err := database.DB.Preload("Device").First(&msg, msgID).Error; err != nil {
		log.Printf("Message ID %d not found in database: %v", msgID, err)
		qw.ackMessage(streamMsg.ID)
		return
	}

	// Only process if status is PENDING
	if msg.Status != "PENDING" {
		log.Printf("Message ID %d status is %s, skipping", msgID, msg.Status)
		qw.ackMessage(streamMsg.ID)
		return
	}

	log.Printf("Processing outgoing message ID %d to %s", msg.ID, msg.Phone)

	// 2. Send via WhatsApp client manager (check message type)
	var waMsgID string
	if msg.MessageType == "image" || msg.MessageType == "document" {
		waMsgID, err = whatsapp.Manager.SendMediaMessage(msg.DeviceID, msg.Phone, msg.MessageType, msg.MediaURL, msg.FileName, msg.Message)
	} else {
		waMsgID, err = whatsapp.Manager.SendTextMessage(msg.DeviceID, msg.Phone, msg.Message)
	}
	if err != nil {
		log.Printf("Failed to send WhatsApp message for ID %d: %v", msg.ID, err)
		
		// Update status to FAILED in DB
		msg.Status = "FAILED"
		database.DB.Save(&msg)

		// Dispatch status update to WebSocket
		whatsapp.PublishWebSocketEvent(msg.DeviceID, "message_failed", map[string]interface{}{
			"id":        msg.ID,
			"uuid":      msg.UUID,
			"device_id": msg.DeviceID,
			"status":    "FAILED",
		})
	} else {
		log.Printf("WhatsApp message sent successfully for ID %d, WA Message ID: %s", msg.ID, waMsgID)

		// Update status to SENT in DB
		now := time.Now()
		msg.Status = "SENT"
		msg.SentAt = &now
		database.DB.Save(&msg)

		// Dispatch status update to WebSocket
		whatsapp.PublishWebSocketEvent(msg.DeviceID, "message_sent", map[string]interface{}{
			"id":        msg.ID,
			"uuid":      msg.UUID,
			"device_id": msg.DeviceID,
			"status":    "SENT",
			"sent_at":   now,
		})
	}

	// 3. Acknowledge message in Redis stream
	qw.ackMessage(streamMsg.ID)
}

func (qw *QueueWorker) ackMessage(streamMsgID string) {
	err := qw.redisClient.XAck(qw.ctx, rdb.MessageQueueStream, rdb.MessageQueueGroup, streamMsgID).Err()
	if err != nil {
		log.Printf("Failed to acknowledge message %s: %v", streamMsgID, err)
	}
}
