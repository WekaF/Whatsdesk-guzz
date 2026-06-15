package redis

import (
	"context"
	"fmt"
	"log"
	"whatapps/backend/configs"

	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client

const MessageQueueStream = "whatsapp_messages_stream"
const MessageQueueGroup  = "whatsapp_messages_group"

func InitRedis(cfg *configs.Config) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.RedisHost, cfg.RedisPort),
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})

	ctx := context.Background()
	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

	log.Println("Redis connection established successfully")
	RDB = rdb

	// Initialize the Consumer Group for Redis Streams if it doesn't exist
	err = rdb.XGroupCreateMkStream(ctx, MessageQueueStream, MessageQueueGroup, "$").Err()
	if err != nil {
		// Ignore BusyGroup error which means the group already exists
		if err.Error() != "BUSYGROUP Consumer Group name already exists" {
			log.Printf("Warning: consumer group creation failed: %v", err)
		}
	}

	return rdb
}

// EnqueueMessage ID to the Redis Stream
func EnqueueMessage(ctx context.Context, messageID uint64) error {
	if RDB == nil {
		return fmt.Errorf("redis client is not initialized")
	}

	err := RDB.XAdd(ctx, &redis.XAddArgs{
		Stream: MessageQueueStream,
		Values: map[string]interface{}{
			"message_id": messageID,
		},
	}).Err()

	if err != nil {
		log.Printf("Failed to enqueue message ID %d: %v", messageID, err)
		return err
	}

	log.Printf("Message ID %d successfully enqueued to stream", messageID)
	return nil
}
