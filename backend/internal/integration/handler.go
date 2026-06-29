package integration

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"math"
	"strconv"
	"strings"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"
	rdb "whatapps/backend/pkg/redis"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type CreateApiKeyRequest struct {
	Name       string     `json:"name"`
	DeviceID   uint64     `json:"device_id"`
	AllowedIPs string     `json:"allowed_ips"`
	ExpiresAt  *time.Time `json:"expires_at"`
}

type SendIntegrationRequest struct {
	Phone       string  `json:"phone"`
	Message     string  `json:"message"`
	MessageType string  `json:"message_type"`
	MediaURL    string  `json:"media_url"`
	FileName    string  `json:"file_name"`
	TaskID      *uint64 `json:"task_id"` // Optional: link explicitly to task
}

// CreateApiKey handles the API key generation
func CreateApiKey(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)

	var req CreateApiKeyRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	if req.Name == "" || req.DeviceID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Name and Device ID are required",
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
		if !config.HasAPIKeys {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Akses API Key tidak tersedia untuk paket langganan Anda saat ini. Silakan upgrade ke paket Lite, Regular, atau Pro.",
			})
		}
	}

	// 1. Verify device belongs to user (or is superadmin)
	var device model.Device
	var dbErr error
	if role == "superadmin" {
		dbErr = database.DB.Where("id = ?", req.DeviceID).First(&device).Error
	} else {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner == nil {
			dbErr = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
				Where("devices.id = ? AND user_devices.user_id = ?", req.DeviceID, owner.ID).
				First(&device).Error
		} else {
			dbErr = errOwner
		}
	}
	if dbErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Device not found or not owned by user",
		})
	}

	// 2. Generate cryptographically secure API key token
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to generate secure API token",
		})
	}
	rawToken := "wa_key_" + hex.EncodeToString(b)

	// 3. Create SHA-256 hash
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])

	// 4. Create Masked token for display
	maskedToken := "wa_key_****************" + rawToken[len(rawToken)-4:]

	allowedIPs := strings.TrimSpace(req.AllowedIPs)
	if allowedIPs == "" {
		allowedIPs = "*"
	}

	apiKey := model.ApiKey{
		Name:        req.Name,
		TokenHash:   tokenHash,
		MaskedToken: maskedToken,
		DeviceID:    req.DeviceID,
		UserID:      userID,
		AllowedIPs:  allowedIPs,
		ExpiresAt:   req.ExpiresAt,
		CreatedAt:   time.Now(),
	}

	if err := database.DB.Create(&apiKey).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save API Key to database",
		})
	}

	// Preload device for response
	database.DB.Model(&apiKey).Association("Device").Find(&apiKey.Device)

	// Return response with clear token included ONCE
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":           apiKey.ID,
		"uuid":         apiKey.UUID,
		"name":         apiKey.Name,
		"token":        rawToken, // Only returned once!
		"masked_token": apiKey.MaskedToken,
		"device_id":    apiKey.DeviceID,
		"device":       apiKey.Device,
		"created_at":   apiKey.CreatedAt,
	})
}
// ListApiKeys retrieves existing API keys
func ListApiKeys(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)

	var apiKeys []model.ApiKey
	var err error

	if role == "superadmin" {
		err = database.DB.Preload("Device").Order("created_at desc").Find(&apiKeys).Error
	} else {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner == nil {
			err = database.DB.Preload("Device").
				Where("user_id = ? OR user_id IN (SELECT id FROM users WHERE parent_id = ?)", owner.ID, owner.ID).
				Order("created_at desc").Find(&apiKeys).Error
		} else {
			err = errOwner
		}
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve API Keys",
		})
	}

	return c.JSON(apiKeys)
}

// DeleteApiKey revokes/deletes an API key
func DeleteApiKey(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	uuidParam := c.Params("uuid")

	keyUUID, err := uuid.Parse(uuidParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid UUID format",
		})
	}

	var apiKey model.ApiKey
	err = database.DB.Where("uuid = ?", keyUUID).First(&apiKey).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "API Key not found",
		})
	}

	// Permission validation
	if role != "superadmin" {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Unauthorized access to API Key",
			})
		}
		var keyUser model.User
		if err := database.DB.First(&keyUser, apiKey.UserID).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Unauthorized access to API Key",
			})
		}
		if keyUser.ID != owner.ID && (keyUser.ParentID == nil || *keyUser.ParentID != owner.ID) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "You do not have permission to delete this API Key",
			})
		}
	}

	if err := database.DB.Delete(&apiKey).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete API Key",
		})
	}

	// Invalidate Redis cache
	if rdb.RDB != nil {
		rdb.RDB.Del(c.Context(), "apikey:hash:"+apiKey.TokenHash)
	}

	return c.JSON(fiber.Map{
		"message": "API Key revoked successfully",
	})
}

// GetApiKeyLogs returns logs (sent messages) for a specific API Key with pagination and search
func GetApiKeyLogs(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	uuidParam := c.Params("uuid")
	searchQuery := c.Query("q")
	pageStr := c.Query("page", "1")
	limitStr := c.Query("limit", "10")

	keyUUID, err := uuid.Parse(uuidParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid UUID format",
		})
	}

	var apiKey model.ApiKey
	err = database.DB.Where("uuid = ?", keyUUID).First(&apiKey).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "API Key not found",
		})
	}

	// Permission validation
	if role != "superadmin" {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Unauthorized access to API Key",
			})
		}
		var keyUser model.User
		if err := database.DB.First(&keyUser, apiKey.UserID).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Unauthorized access to API Key",
			})
		}
		if keyUser.ID != owner.ID && (keyUser.ParentID == nil || *keyUser.ParentID != owner.ID) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "You do not have permission to view logs for this API Key",
			})
		}
	}

	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		page = 1
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 10
	}

	query := database.DB.Model(&model.Message{}).Where("api_key_id = ?", apiKey.ID)

	if searchQuery != "" {
		q := "%" + strings.ToLower(searchQuery) + "%"
		query = query.Where("(phone LIKE ? OR LOWER(message) LIKE ?)", q, q)
	}

	// Get total count
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve logs count",
		})
	}

	// Apply pagination
	offset := (page - 1) * limit
	var messages []model.Message
	err = query.Order("created_at desc").Offset(offset).Limit(limit).Find(&messages).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve logs",
		})
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))
	if totalPages == 0 {
		totalPages = 1
	}

	return c.JSON(fiber.Map{
		"data":        messages,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// SendIntegrationMessage queues an outgoing message sent via API Key
func SendIntegrationMessage(c *fiber.Ctx) error {
	deviceID := c.Locals("device_id").(uint64)
	apiKeyID := c.Locals("api_key_id").(uint64)

	var req SendIntegrationRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	if req.Phone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Phone is required",
		})
	}

	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	// Check subscription & quota limit for non-superadmin API key owner
	var user model.User
	if role != "superadmin" {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to resolve API key owner account",
			})
		}
		user = owner

		// Reload/sync owner to get latest message count
		if err := database.DB.First(&user, user.ID).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to sync API key owner account",
			})
		}

		// Reset monthly message counter if past reset date
		now := time.Now()
		if !user.MessageResetAt.IsZero() && now.After(user.MessageResetAt) {
			user.MonthlyMessageSent = 0
			user.MessageResetAt = now.AddDate(0, 1, 0)
			database.DB.Save(&user)
		}

		// Check subscription active status
		if !model.IsSubscriptionActive(&user) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "Masa aktif langganan pemilik API Key ini telah habis.",
			})
		}

		// Check monthly message limit
		config := model.GetTierConfig(user.SubscriptionTier)
		if user.MonthlyMessageSent >= config.MaxMessages {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Kuota pengiriman pesan bulanan untuk API Key ini telah habis.",
			})
		}
	}
	if req.Message == "" && req.MediaURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Message or Media URL is required",
		})
	}

	// Resolve active task id for this contact
	var taskID *uint64
	if req.TaskID != nil && *req.TaskID != 0 {
		taskID = req.TaskID
		database.DB.Model(&model.Task{}).Where("id = ?", *taskID).Update("updated_at", time.Now())
	} else {
		realPhone := database.ResolveRealPhone(req.Phone)
		var activeTask model.Task
		if err := database.DB.Where("device_id = ? AND phone = ? AND status != 'Closed'", deviceID, realPhone).Order("updated_at DESC").First(&activeTask).Error; err == nil && activeTask.ID != 0 {
			taskID = &activeTask.ID
			database.DB.Model(&activeTask).Update("updated_at", time.Now())
		}
	}

	msgType := req.MessageType
	if msgType == "" {
		msgType = "text"
	}

	msg := model.Message{
		DeviceID:    deviceID,
		Direction:   "OUT",
		Phone:       req.Phone,
		Message:     req.Message,
		Status:      "PENDING",
		TaskID:      taskID,
		MessageType: msgType,
		MediaURL:    req.MediaURL,
		FileName:    req.FileName,
		ApiKeyID:    &apiKeyID,
		CreatedAt:   time.Now(),
	}

	if err := database.DB.Create(&msg).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to save integration message in database",
		})
	}
	// Increment sent counter for non-superadmin
	if role != "superadmin" {
		database.DB.Model(&user).Update("monthly_message_sent", user.MonthlyMessageSent+1)
	}
	// Save to task_messages if there is an active support task
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

	// Push message to redis queue stream
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := rdb.EnqueueMessage(ctx, msg.ID)
	if err != nil {
		msg.Status = "FAILED"
		database.DB.Save(&msg)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to queue integration message for sending",
		})
	}

	return c.Status(fiber.StatusAccepted).JSON(msg)
}

// ToggleApiKeyActive toggles the is_active status of an API Key
func ToggleApiKeyActive(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	uuidParam := c.Params("uuid")

	keyUUID, err := uuid.Parse(uuidParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid UUID format",
		})
	}

	var apiKey model.ApiKey
	err = database.DB.Where("uuid = ?", keyUUID).First(&apiKey).Error
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "API Key not found",
		})
	}

	// Permission validation
	if role != "superadmin" {
		owner, errOwner := database.GetSubscriptionOwner(userID)
		if errOwner != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Unauthorized access to API Key",
			})
		}
		var keyUser model.User
		if err := database.DB.First(&keyUser, apiKey.UserID).Error; err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Unauthorized access to API Key",
			})
		}
		if keyUser.ID != owner.ID && (keyUser.ParentID == nil || *keyUser.ParentID != owner.ID) {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "You do not have permission to modify this API Key",
			})
		}
	}

	// Toggle status
	apiKey.IsActive = !apiKey.IsActive
	if err := database.DB.Save(&apiKey).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update API Key status",
		})
	}

	// Invalidate Redis cache
	if rdb.RDB != nil {
		rdb.RDB.Del(c.Context(), "apikey:hash:"+apiKey.TokenHash)
	}

	return c.JSON(apiKey)
}
