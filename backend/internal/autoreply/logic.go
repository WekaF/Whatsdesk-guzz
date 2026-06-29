package autoreply

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"
	rdb "whatapps/backend/pkg/redis"
)

func cleanPhoneDigits(phone string) string {
	parts := strings.Split(phone, "@")
	phoneDigits := parts[0]
	clean := ""
	for _, char := range phoneDigits {
		if char >= '0' && char <= '9' {
			clean += string(char)
		}
	}
	return clean
}

// MatchAndTriggerReply checks if the incoming message matches any active auto-reply rules for the device.
// If a match is found, it automatically creates a pending outgoing message and pushes it to the Redis queue.
func MatchAndTriggerReply(deviceID uint64, incomingMsg *model.Message) {
	// 1. Fetch active rules for the device
	var rules []model.AutoReply
	err := database.DB.Where("device_id = ? AND is_active = ?", deviceID, true).Find(&rules).Error
	if err != nil {
		log.Printf("[AutoReply] Failed to query rules for device %d: %v", deviceID, err)
		return
	}

	if len(rules) == 0 {
		return
	}

	incomingClean := strings.TrimSpace(strings.ToLower(incomingMsg.Message))

	for _, rule := range rules {
		keywordClean := strings.TrimSpace(strings.ToLower(rule.Keyword))
		matched := false

		switch strings.ToUpper(rule.MatchType) {
		case "EXACT":
			matched = (incomingClean == keywordClean)
		case "CONTAINS":
			matched = strings.Contains(incomingClean, keywordClean)
		case "START_WITH":
			matched = strings.HasPrefix(incomingClean, keywordClean)
		default:
			// Default fallback is EXACT
			matched = (incomingClean == keywordClean)
		}

		if matched {
			log.Printf("[AutoReply] Match found! Keyword: '%s', MatchType: %s. Triggering reply to %s.", rule.Keyword, rule.MatchType, incomingMsg.Phone)

			var taskID *uint64

			// If this auto-reply rule should create a task
			if rule.CreateTask {
				realPhone := database.ResolveRealPhone(incomingMsg.Phone)

				// Check if there is already an active task for this phone and device
				var activeTask model.Task
				err := database.DB.Where("device_id = ? AND phone = ? AND status != 'Closed' and trigger_msg = ? ", deviceID, realPhone, incomingMsg.Message).Order("updated_at DESC").First(&activeTask).Error
				if err == nil {
					// Active task already exists, link to it
					taskID = &activeTask.ID
				} else {
					// Create a new task with real phone number
					newTask := model.Task{
						DeviceID:   deviceID,
						Phone:      realPhone, // Save clean real phone number digits
						TriggerMsg: incomingMsg.Message,
						Status:     "Open",
						CategoryID: rule.TaskCategoryID,
						WebhookURL: rule.WebhookURL,
						CreatedAt:  time.Now(),
						UpdatedAt:  time.Now(),
					}
					if err := database.DB.Create(&newTask).Error; err != nil {
						log.Printf("[AutoReply] Failed to create task: %v", err)
					} else {
						taskID = &newTask.ID
						log.Printf("[AutoReply] Created new task ID %d for phone %s", newTask.ID, realPhone)

						// Send WhatsApp broadcast notifications to team members
						var createdTask model.Task
						if err := database.DB.Preload("Category").First(&createdTask, newTask.ID).Error; err == nil {
							categoryName := "None"
							if createdTask.Category != nil {
								categoryName = createdTask.Category.Name
							}

							notifText := fmt.Sprintf("Halo teams ada yang baru nih , %s dengan categori %s Masuk, Segera Eksekusi ya, terima kasih", createdTask.Number, categoryName)

							var notifyUsers []model.User
							if err := database.DB.Preload("TaskCategories").Where("is_notification_enabled = ? AND phone_number != ''", true).Find(&notifyUsers).Error; err == nil {
								for _, u := range notifyUsers {
									hasAccess := false
									if len(u.TaskCategories) == 0 {
										hasAccess = true
									} else {
										if createdTask.CategoryID != nil {
											for _, cat := range u.TaskCategories {
												if cat.ID == *createdTask.CategoryID {
													hasAccess = true
													break
												}
											}
										}
									}

									if hasAccess {
										msg := model.Message{
											DeviceID:    deviceID,
											Direction:   "OUT",
											Phone:       u.PhoneNumber,
											Message:     notifText,
											Status:      "PENDING",
											TaskID:      taskID,
											MessageType: "text",
											CreatedAt:   time.Now(),
										}
										if err := database.DB.Create(&msg).Error; err == nil {
											ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
											if err := rdb.EnqueueMessage(ctx, msg.ID); err != nil {
												log.Printf("[AutoReply/Notif] Failed to enqueue notification message ID %d: %v", msg.ID, err)
												msg.Status = "FAILED"
												database.DB.Save(&msg)
											} else {
												log.Printf("[AutoReply/Notif] Enqueued task notification message ID %d for user %s to %s", msg.ID, u.Email, u.PhoneNumber)
											}
											cancel()
										} else {
											log.Printf("[AutoReply/Notif] Failed to create notification message record: %v", err)
										}
									}
								}
							}
						} else {
							log.Printf("[AutoReply/Notif] Failed to load created task ID %d details for broadcast: %v", newTask.ID, err)
						}
					}
				}
			}

			// Update the incoming message with TaskID if linked to a task
			if taskID != nil {
				incomingMsg.TaskID = taskID
				database.DB.Model(incomingMsg).Update("task_id", taskID)

				// Log the incoming message to task messages
				taskInMsg := model.TaskMessage{
					TaskID:    *taskID,
					Direction: "IN",
					Message:   incomingMsg.Message,
					CreatedAt: time.Now(),
				}
				database.DB.Create(&taskInMsg)
			}

			// 2. Create outgoing message (only if ReplyMessage is not empty)
			if rule.ReplyMessage != "" {
				msg := model.Message{
					DeviceID:  deviceID,
					Direction: "OUT",
					Phone:     incomingMsg.Phone,
					Message:   rule.ReplyMessage,
					Status:    "PENDING",
					TaskID:    taskID,
					CreatedAt: time.Now(),
				}

				if err := database.DB.Create(&msg).Error; err != nil {
					log.Printf("[AutoReply] Failed to save auto-reply message: %v", err)
					return
				}

				// Log the outgoing message to task messages
				if taskID != nil {
					taskOutMsg := model.TaskMessage{
						TaskID:    *taskID,
						Direction: "OUT",
						Message:   rule.ReplyMessage,
						CreatedAt: time.Now(),
					}
					database.DB.Create(&taskOutMsg)
				}

				// 3. Enqueue to Redis queue for asynchronous delivery
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				err := rdb.EnqueueMessage(ctx, msg.ID)
				cancel()

				if err != nil {
					log.Printf("[AutoReply] Failed to enqueue auto-reply message ID %d: %v", msg.ID, err)
					msg.Status = "FAILED"
					database.DB.Save(&msg)
				}
			}

			// Stop checking after the first match to avoid multiple replies
			return
		}
	}
}
