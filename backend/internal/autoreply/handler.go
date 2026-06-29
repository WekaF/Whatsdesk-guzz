package autoreply

import (
	"fmt"
	"strconv"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type AutoReplyRequest struct {
	DeviceID         uint64  `json:"device_id"`
	Keyword          string  `json:"keyword"`
	MatchType        string  `json:"match_type"` // EXACT, CONTAINS, START_WITH
	ReplyMessage     *string `json:"reply_message,omitempty"`
	WebhookURL       *string `json:"webhook_url,omitempty"`
	IsActive         *bool   `json:"is_active,omitempty"`
	CreateTask       *bool   `json:"create_task,omitempty"`
	TaskCategoryUUID string  `json:"task_category_uuid,omitempty"` // UUID of TaskCategory; required when create_task=true
}

// CreateAutoReply handles POST /api/auto-replies
func CreateAutoReply(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)

	var req AutoReplyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	var reqReply string
	if req.ReplyMessage != nil {
		reqReply = *req.ReplyMessage
	}
	var reqWebhook string
	if req.WebhookURL != nil {
		reqWebhook = *req.WebhookURL
	}
	if req.DeviceID == 0 || req.Keyword == "" || (reqReply == "" && reqWebhook == "") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Device ID, keyword, and reply message or webhook URL are required",
		})
	}

	// Validate MatchType
	matchType := "EXACT"
	if req.MatchType == "CONTAINS" || req.MatchType == "START_WITH" {
		matchType = req.MatchType
	}
	// Verify device belongs to user
	var device model.Device
	var err error
	if role == "superadmin" {
		err = database.DB.Where("id = ?", req.DeviceID).First(&device).Error
	} else {
		// Get subscription owner to check if the device is owned under the subscription
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to resolve subscription owner account",
			})
		}
		err = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
			Where("devices.id = ? AND user_devices.user_id = ?", req.DeviceID, owner.ID).
			First(&device).Error
	}
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Device not found or not owned by user",
		})
	}

	// 0. Resolve User & Check Subscription Tier Limits for non-superadmin
	var user model.User
	if role != "superadmin" {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to resolve subscription owner account",
			})
		}
		user = owner

		// Check subscription active status
		if !model.IsSubscriptionActive(&user) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "Masa aktif langganan Anda telah habis. Harap perbarui langganan Anda.",
			})
		}

		config := model.GetTierConfig(user.SubscriptionTier)

		// 1. Check Max Auto-Replies Count Limit
		var currentRulesCount int64
		if err := database.DB.Model(&model.AutoReply{}).
			Joins("JOIN user_devices ON user_devices.device_id = auto_replies.device_id").
			Where("user_devices.user_id = ?", user.ID).
			Count(&currentRulesCount).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to verify current auto-reply rules count",
			})
		}

		if int(currentRulesCount) >= config.MaxAutoReplies {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": fmt.Sprintf("Batas maksimal aturan auto-reply untuk paket %s adalah %d aturan. Harap tingkatkan (upgrade) paket Anda.", user.SubscriptionTier, config.MaxAutoReplies),
			})
		}

		// 2. Check Webhook Access Limit
		if reqWebhook != "" && !config.HasWebhooks {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": fmt.Sprintf("Fitur webhook auto-reply tidak tersedia pada paket %s. Harap upgrade ke paket Regular atau Pro.", user.SubscriptionTier),
			})
		}
	}
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	createTask := false
	if req.CreateTask != nil {
		createTask = *req.CreateTask
	}

	// Resolve category UUID → internal ID (required when create_task = true)
	var taskCategoryID *uint64
	if req.TaskCategoryUUID != "" {
		parsedUUID, err := uuid.Parse(req.TaskCategoryUUID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid task_category_uuid format",
			})
		}
		var cat model.TaskCategory
		if err := database.DB.Where("uuid = ?", parsedUUID).First(&cat).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Task category not found",
			})
		}
		taskCategoryID = &cat.ID
	} else if createTask {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "task_category_uuid is required when create_task is true",
		})
	}

	rule := model.AutoReply{
		DeviceID:       req.DeviceID,
		Keyword:        req.Keyword,
		MatchType:      matchType,
		ReplyMessage:   reqReply,
		WebhookURL:     reqWebhook,
		IsActive:       isActive,
		CreateTask:     createTask,
		TaskCategoryID: taskCategoryID,
		CreatedAt:      time.Now(),
	}

	if err := database.DB.Create(&rule).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create auto-reply rule",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(rule)
}
// ListAutoReplies handles GET /api/auto-replies
func ListAutoReplies(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	deviceIDStr := c.Query("device_id")

	query := database.DB.Model(&model.AutoReply{}).
		Joins("JOIN devices ON devices.id = auto_replies.device_id")

	if role != "superadmin" {
		owner, err := database.GetSubscriptionOwner(userID)
		if err == nil {
			query = query.Joins("JOIN user_devices ON user_devices.device_id = auto_replies.device_id").
				Where("user_devices.user_id = ?", owner.ID)
		}
	}

	if deviceIDStr != "" {
		deviceID, err := strconv.ParseUint(deviceIDStr, 10, 64)
		if err == nil {
			query = query.Where("auto_replies.device_id = ?", deviceID)
		}
	}

	var rules []model.AutoReply
	if err := query.Preload("TaskCategory").Order("auto_replies.created_at desc").Find(&rules).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve auto-reply rules",
		})
	}

	return c.JSON(rules)
}
// UpdateAutoReply handles PUT /api/auto-replies/:id
func UpdateAutoReply(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	ruleUUID := c.Params("uuid")

	if ruleUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid rule UUID",
		})
	}

	var req AutoReplyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}
	// Find the rule and ensure ownership through device
	var rule model.AutoReply
	var err error
	if role == "superadmin" {
		err = database.DB.Model(&model.AutoReply{}).
			Joins("JOIN devices ON devices.id = auto_replies.device_id").
			Where("auto_replies.uuid = ?", ruleUUID).
			First(&rule).Error
	} else {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner == nil {
			err = database.DB.Model(&model.AutoReply{}).
				Joins("JOIN devices ON devices.id = auto_replies.device_id").
				Joins("JOIN user_devices ON user_devices.device_id = auto_replies.device_id").
				Where("auto_replies.uuid = ? AND user_devices.user_id = ?", ruleUUID, owner.ID).
				First(&rule).Error
		} else {
			err = errOwner
		}
	}
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Auto-reply rule not found or not owned by user",
		})
	}
	// Update fields
	if req.Keyword != "" {
		rule.Keyword = req.Keyword
	}
	if req.MatchType != "" {
		if req.MatchType == "EXACT" || req.MatchType == "CONTAINS" || req.MatchType == "START_WITH" {
			rule.MatchType = req.MatchType
		}
	}
	if req.ReplyMessage != nil {
		rule.ReplyMessage = *req.ReplyMessage
	}
	if req.WebhookURL != nil {
		rule.WebhookURL = *req.WebhookURL
	}
	if rule.ReplyMessage == "" && rule.WebhookURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Reply message or webhook URL are required",
		})
	}
	if req.IsActive != nil {
		rule.IsActive = *req.IsActive
	}

	// Handle create_task + category update
	newCreateTask := rule.CreateTask
	if req.CreateTask != nil {
		newCreateTask = *req.CreateTask
	}
	if req.TaskCategoryUUID != "" {
		parsedUUID, err := uuid.Parse(req.TaskCategoryUUID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid task_category_uuid format",
			})
		}
		var cat model.TaskCategory
		if err := database.DB.Where("uuid = ?", parsedUUID).First(&cat).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Task category not found",
			})
		}
		rule.TaskCategoryID = &cat.ID
	} else if newCreateTask && rule.TaskCategoryID == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "task_category_uuid is required when create_task is true",
		})
	}
	if req.CreateTask != nil {
		rule.CreateTask = *req.CreateTask
	}

	if err := database.DB.Save(&rule).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update auto-reply rule",
		})
	}

	return c.JSON(rule)
}

// DeleteAutoReply handles DELETE /api/auto-replies/:id
func DeleteAutoReply(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	ruleUUID := c.Params("uuid")

	if ruleUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid rule UUID",
		})
	}
	// Verify rule exists and belongs to user
	var rule model.AutoReply
	var err error
	if role == "superadmin" {
		err = database.DB.Model(&model.AutoReply{}).
			Joins("JOIN devices ON devices.id = auto_replies.device_id").
			Where("auto_replies.uuid = ?", ruleUUID).
			First(&rule).Error
	} else {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner == nil {
			err = database.DB.Model(&model.AutoReply{}).
				Joins("JOIN devices ON devices.id = auto_replies.device_id").
				Joins("JOIN user_devices ON user_devices.device_id = auto_replies.device_id").
				Where("auto_replies.uuid = ? AND user_devices.user_id = ?", ruleUUID, owner.ID).
				First(&rule).Error
		} else {
			err = errOwner
		}
	}
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Auto-reply rule not found or not owned by user",
		})
	}
	if err := database.DB.Delete(&rule).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete auto-reply rule",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Auto-reply rule deleted successfully",
	})
}
