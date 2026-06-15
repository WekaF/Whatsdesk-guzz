package message

import (
	"context"
	"strconv"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"
	rdb "whatapps/backend/pkg/redis"

	"github.com/gofiber/fiber/v2"
)

type SendMessageRequest struct {
	DeviceID    uint64  `json:"device_id" form:"device_id"`
	Phone       string  `json:"phone" form:"phone"`
	Message     string  `json:"message" form:"message"`
	TaskID      *uint64 `json:"task_id" form:"task_id"`
	MessageType string  `json:"message_type" form:"message_type"`
	MediaURL    string  `json:"media_url" form:"media_url"`
	FileName    string  `json:"file_name" form:"file_name"`
}

func SendMessage(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)

	var req SendMessageRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	if req.DeviceID == 0 || req.Phone == "" || req.Message == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Device ID, phone, and message are required",
		})
	}

	// 1. Verify device belongs to user
	var device model.Device
	var dbErr error
	if role == "admin" {
		dbErr = database.DB.Where("id = ?", req.DeviceID).First(&device).Error
	} else {
		dbErr = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
			Where("devices.id = ? AND user_devices.user_id = ?", req.DeviceID, userID).
			First(&device).Error
	}
	if dbErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Device not found or not owned by user",
		})
	}

	// 2. Resolve task ID – if client provides it directly, use it;
	//    otherwise fall back to DB lookup by device+phone.
	var taskID *uint64

	if req.TaskID != nil && *req.TaskID != 0 {
		// Use the task_id provided directly by the frontend
		taskID = req.TaskID
		// Update task updated_at to keep it bubbled up in lists
		database.DB.Model(&model.Task{}).Where("id = ?", *taskID).Update("updated_at", time.Now())
	} else {
		// Fallback: look up by device + phone (for callers that don't know the task)
		realPhone := database.ResolveRealPhone(req.Phone)
		var activeTask model.Task
		if err := database.DB.Where("device_id = ? AND phone = ? AND status != 'Closed'", req.DeviceID, realPhone).Order("updated_at DESC").First(&activeTask).Error; err == nil && activeTask.ID != 0 {
			taskID = &activeTask.ID
			database.DB.Model(&activeTask).Update("updated_at", time.Now())
		}
	}

	// 2.5 Task PIC Assignment & Validation
	if taskID != nil {
		var activeTask model.Task
		if err := database.DB.First(&activeTask, *taskID).Error; err == nil {
			currentUserStr := strconv.FormatUint(userID, 10)
			if activeTask.UpdatedBy == "" {
				// No PIC assigned yet, assign the logged-in user
				activeTask.UpdatedBy = currentUserStr
				database.DB.Model(&activeTask).Update("updated_by", currentUserStr)
			} else if activeTask.UpdatedBy != currentUserStr {
				// Task is locked by a different user. Resolve their name/nickname for error message
				var picUser model.User
				picName := "lain"
				if picUserID, err := strconv.ParseUint(activeTask.UpdatedBy, 10, 64); err == nil {
					if err := database.DB.First(&picUser, picUserID).Error; err == nil {
						if picUser.Nickname != "" {
							picName = picUser.Nickname
						} else {
							picName = picUser.Name
						}
					}
				}
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "Task sedang dikerjakan pic " + picName,
				})
			}
		}
	}

	// Set default message type to text if not provided
	msgType := req.MessageType
	if msgType == "" {
		msgType = "text"
	}

	// Append sender's nickname signature to message body if it is a task chat
	if taskID != nil && req.Message != "" {
		var senderUser model.User
		if err := database.DB.Where("id = ?", userID).First(&senderUser).Error; err == nil && senderUser.Nickname != "" {
			req.Message = req.Message + "\nRegard, " + senderUser.Nickname
		}
	}

	// Insert into database with status PENDING
	msg := model.Message{
		DeviceID:    req.DeviceID,
		Direction:   "OUT",
		Phone:       req.Phone,
		Message:     req.Message,
		Status:      "PENDING",
		TaskID:      taskID,
		MessageType: msgType,
		MediaURL:    req.MediaURL,
		FileName:    req.FileName,
		CreatedAt:   time.Now(),
	}

	if err := database.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save message in database",
		})
	}

	// Log message under the active Task
	if taskID != nil {
		taskOutMsg := model.TaskMessage{
			TaskID:      *taskID,
			Direction:   "OUT",
			Message:     req.Message,
			MessageType: msgType,
			MediaURL:    req.MediaURL,
			FileName:    req.FileName,
			CreatedAt:   time.Now(),
		}
		database.DB.Create(&taskOutMsg)
	}

	// 3. Push to Redis queue stream
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := rdb.EnqueueMessage(ctx, msg.ID)
	if err != nil {
		// Even if queue fails, we keep the DB record and could retry later.
		// For now return an error status, but mark status as FAILED in database
		msg.Status = "FAILED"
		database.DB.Save(&msg)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to queue message for sending",
		})
	}

	return c.Status(fiber.StatusAccepted).JSON(msg)
}

func ListMessages(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	deviceIDStr := c.Query("device_id")

	dbQuery := database.DB.Model(&model.Message{}).
		Select("messages.*, COALESCE(whatsmeow_lid_map.pn, messages.phone) as phone").
		Joins("JOIN devices ON devices.id = messages.device_id").
		Joins("LEFT JOIN whatsmeow_lid_map ON split_part(whatsmeow_lid_map.lid, '@', 1) = split_part(messages.phone, '@', 1)")

	if role != "admin" {
		dbQuery = dbQuery.Joins("JOIN user_devices ON user_devices.device_id = messages.device_id").
			Where("user_devices.user_id = ?", userID)
	}

	if deviceIDStr != "" {
		deviceID, err := strconv.ParseUint(deviceIDStr, 10, 64)
		if err == nil {
			dbQuery = dbQuery.Where("messages.device_id = ?", deviceID)
		}
	}

	var messages []model.Message
	if err := dbQuery.Order("messages.created_at desc").Limit(100).Find(&messages).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve messages",
		})
	}

	return c.JSON(messages)
}
