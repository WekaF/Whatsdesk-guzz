package autoreply

import (
	"strconv"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type AutoReplyRequest struct {
	DeviceID         uint64 `json:"device_id"`
	Keyword          string `json:"keyword"`
	MatchType        string `json:"match_type"` // EXACT, CONTAINS, START_WITH
	ReplyMessage     string `json:"reply_message"`
	IsActive         *bool  `json:"is_active,omitempty"`
	CreateTask       *bool  `json:"create_task,omitempty"`
	TaskCategoryUUID string `json:"task_category_uuid,omitempty"` // UUID of TaskCategory; required when create_task=true
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

	if req.DeviceID == 0 || req.Keyword == "" || req.ReplyMessage == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Device ID, keyword, and reply message are required",
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
	if role == "admin" {
		err = database.DB.Where("id = ?", req.DeviceID).First(&device).Error
	} else {
		err = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
			Where("devices.id = ? AND user_devices.user_id = ?", req.DeviceID, userID).
			First(&device).Error
	}
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Device not found or not owned by user",
		})
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
		ReplyMessage:   req.ReplyMessage,
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

	if role != "admin" {
		query = query.Joins("JOIN user_devices ON user_devices.device_id = auto_replies.device_id").
			Where("user_devices.user_id = ?", userID)
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
	if role == "admin" {
		err = database.DB.Model(&model.AutoReply{}).
			Joins("JOIN devices ON devices.id = auto_replies.device_id").
			Where("auto_replies.uuid = ?", ruleUUID).
			First(&rule).Error
	} else {
		err = database.DB.Model(&model.AutoReply{}).
			Joins("JOIN devices ON devices.id = auto_replies.device_id").
			Joins("JOIN user_devices ON user_devices.device_id = auto_replies.device_id").
			Where("auto_replies.uuid = ? AND user_devices.user_id = ?", ruleUUID, userID).
			First(&rule).Error
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
	if req.ReplyMessage != "" {
		rule.ReplyMessage = req.ReplyMessage
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
	if role == "admin" {
		err = database.DB.Model(&model.AutoReply{}).
			Joins("JOIN devices ON devices.id = auto_replies.device_id").
			Where("auto_replies.uuid = ?", ruleUUID).
			First(&rule).Error
	} else {
		err = database.DB.Model(&model.AutoReply{}).
			Joins("JOIN devices ON devices.id = auto_replies.device_id").
			Joins("JOIN user_devices ON user_devices.device_id = auto_replies.device_id").
			Where("auto_replies.uuid = ? AND user_devices.user_id = ?", ruleUUID, userID).
			First(&rule).Error
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
