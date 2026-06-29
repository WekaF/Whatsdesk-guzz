package user

import (
	"fmt"
	"strings"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/crypto/bcrypt"
)

type UserCreateRequest struct {
	Name                  string   `json:"name"`
	Email                 string   `json:"email"`
	Password              string   `json:"password"`
	Role                  string   `json:"role"`
	Nickname              string   `json:"nickname"`
	DeviceIDs             []uint64 `json:"device_ids"`
	TaskCategoryUUIDs     []string `json:"task_category_uuids"`
	PhoneNumber           string   `json:"phone_number"`
	IsNotificationEnabled bool     `json:"is_notification_enabled"`
}

type UserUpdateRequest struct {
	Name                  string   `json:"name"`
	Email                 string   `json:"email"`
	Password              string   `json:"password,omitempty"`
	Role                  string   `json:"role,omitempty"`
	Nickname              string   `json:"nickname"`
	DeviceIDs             []uint64 `json:"device_ids"`
	TaskCategoryUUIDs     []string `json:"task_category_uuids"`
	PhoneNumber           string   `json:"phone_number"`
	IsNotificationEnabled *bool    `json:"is_notification_enabled"`
}

// ListUsers handles GET /api/users
func ListUsers(c *fiber.Ctx) error {
	currentUserID := c.Locals("user_id").(uint64)
	currentUserRole := c.Locals("role").(string)

	query := database.DB.Order("id asc").Preload("Devices").Preload("TaskCategories")

	if currentUserRole == "superadmin" {
		// No filter
	} else if currentUserRole == "owner_subscriber" {
		query = query.Where("id = ? OR parent_id = ?", currentUserID, currentUserID)
	} else {
		query = query.Where("id = ?", currentUserID)
	}

	var users []model.User
	if err := query.Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve users",
		})
	}
	return c.JSON(users)
}

// GetUser handles GET /api/users/:uuid
func GetUser(c *fiber.Ctx) error {
	userUUID := c.Params("uuid")
	if userUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user UUID",
		})
	}

	var user model.User
	if err := database.DB.Preload("Devices").Preload("TaskCategories").Where("uuid = ?", userUUID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	currentUserID := c.Locals("user_id").(uint64)
	currentUserRole := c.Locals("role").(string)

	if currentUserRole == "superadmin" {
		return c.JSON(user)
	}

	if currentUserID == user.ID {
		return c.JSON(user)
	}

	if currentUserRole == "owner_subscriber" && user.ParentID != nil && *user.ParentID == currentUserID {
		return c.JSON(user)
	}

	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"error": "You do not have permission to access this user's details",
	})
}

// CreateUser handles POST /api/users
func CreateUser(c *fiber.Ctx) error {
	var req UserCreateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	if req.Name == "" || req.Email == "" || req.Password == "" || req.Role == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Name, email, password, and role are required",
		})
	}

	if req.IsNotificationEnabled && strings.TrimSpace(req.PhoneNumber) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Phone number is required when notifications are enabled",
		})
	}

	currentUserID := c.Locals("user_id").(uint64)
	currentUserRole := c.Locals("role").(string)

	var parentID *uint64
	var subscriptionTier string = "free"
	var subscriptionEndsAt *time.Time

	if currentUserRole == "superadmin" {
		// Superadmin can set whatever they want. Let's make sure the role exists.
		var role model.Role
		if err := database.DB.Where("name = ?", req.Role).First(&role).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Role does not exist",
			})
		}
	} else if currentUserRole == "owner_subscriber" {
		// Force role to admin_subscriber
		req.Role = "admin_subscriber"

		// Fetch owner to inherit subscription data & check MaxUsers limit
		var owner model.User
		if err := database.DB.First(&owner, currentUserID).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to resolve owner details",
			})
		}

		// Check active subscription status
		if !model.IsSubscriptionActive(&owner) {
			return c.Status(fiber.StatusPaymentRequired).JSON(fiber.Map{
				"error": "Masa aktif langganan Anda telah habis. Harap perbarui langganan Anda.",
			})
		}

		config := model.GetTierConfig(owner.SubscriptionTier)
		var activeSubUsersCount int64
		if err := database.DB.Model(&model.User{}).Where("parent_id = ?", owner.ID).Count(&activeSubUsersCount).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to check current user count limit",
			})
		}

		if int(activeSubUsersCount)+1 >= config.MaxUsers {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": fmt.Sprintf("Batas maksimal pengguna (staf) untuk paket %s adalah %d pengguna. Harap tingkatkan (upgrade) paket Anda.", owner.SubscriptionTier, config.MaxUsers),
			})
		}

		parentID = &owner.ID
		subscriptionTier = owner.SubscriptionTier
		subscriptionEndsAt = owner.SubscriptionEndsAt
	} else {
		// admin_subscriber or any other role is not allowed to create users
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You do not have permission to create users",
		})
	}

	// Check if user email already exists
	var existingUser model.User
	if err := database.DB.Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "Email already registered",
		})
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to hash password",
		})
	}

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	user := model.User{
		Name:                  req.Name,
		Nickname:              req.Nickname,
		Email:                 req.Email,
		Password:              string(hashedPassword),
		Role:                  req.Role,
		ParentID:              parentID,
		SubscriptionTier:      subscriptionTier,
		SubscriptionEndsAt:    subscriptionEndsAt,
		PhoneNumber:           req.PhoneNumber,
		IsNotificationEnabled: req.IsNotificationEnabled,
		CreatedAt:             time.Now(),
	}

	if err := tx.Create(&user).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create user",
		})
	}

	if len(req.DeviceIDs) > 0 {
		var userDevices []model.UserDevice
		for _, devID := range req.DeviceIDs {
			userDevices = append(userDevices, model.UserDevice{
				UserID:   user.ID,
				DeviceID: devID,
			})
		}
		if err := tx.Create(&userDevices).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to assign devices to user",
			})
		}
	}

	if len(req.TaskCategoryUUIDs) > 0 {
		var cats []model.TaskCategory
		if err := tx.Where("uuid IN ?", req.TaskCategoryUUIDs).Find(&cats).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to fetch task categories",
			})
		}
		if len(cats) != len(req.TaskCategoryUUIDs) {
			tx.Rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "One or more assigned task categories were not found",
			})
		}
		var userTaskCats []model.UserTaskCategory
		for _, cat := range cats {
			userTaskCats = append(userTaskCats, model.UserTaskCategory{
				UserID:         user.ID,
				TaskCategoryID: cat.ID,
			})
		}
		if err := tx.Create(&userTaskCats).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to assign task categories to user",
			})
		}
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to commit transaction",
		})
	}

	// Load with assigned devices and task categories to return in response
	database.DB.Preload("Devices").Preload("TaskCategories").First(&user, user.ID)
	return c.Status(fiber.StatusCreated).JSON(user)
}

// UpdateUser handles PUT /api/users/:uuid
func UpdateUser(c *fiber.Ctx) error {
	userUUID := c.Params("uuid")
	if userUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user UUID",
		})
	}

	var req UserUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	var user model.User
	if err := database.DB.Where("uuid = ?", userUUID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	currentUserID := c.Locals("user_id").(uint64)
	currentUserRole := c.Locals("role").(string)

	// Scope check for non-superadmin
	if currentUserRole != "superadmin" {
		if currentUserID != user.ID {
			if currentUserRole == "owner_subscriber" {
				if user.ParentID == nil || *user.ParentID != currentUserID {
					return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
						"error": "You do not have permission to update this user",
					})
				}
			} else {
				// admin_subscriber or other roles cannot update others
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error": "You do not have permission to update this user",
				})
			}
		}
	}

	// If updating role, check permissions
	if req.Role != "" && req.Role != user.Role {
		if currentUserRole == "superadmin" {
			var role model.Role
			if err := database.DB.Where("name = ?", req.Role).First(&role).Error; err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "Assigned role does not exist",
				})
			}
			user.Role = req.Role
		} else if currentUserRole == "owner_subscriber" {
			// owner_subscriber can only assign admin_subscriber
			if req.Role != "admin_subscriber" {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error": "You do not have permission to change user role to something other than admin_subscriber",
				})
			}
			user.Role = "admin_subscriber"
		} else {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "You do not have permission to change user roles",
			})
		}
	}

	// Keep subscription tier & ends_at inherited from owner if updating a sub-user
	if user.ParentID != nil {
		var owner model.User
		if err := database.DB.First(&owner, *user.ParentID).Error; err == nil {
			user.SubscriptionTier = owner.SubscriptionTier
			user.SubscriptionEndsAt = owner.SubscriptionEndsAt
		}
	}

	// Update fields if provided
	if req.Name != "" {
		user.Name = req.Name
	}
	user.Nickname = req.Nickname
	if req.Email != "" {
		// Check email uniqueness if email is changed
		if req.Email != user.Email {
			var existingUser model.User
			if err := database.DB.Where("email = ? AND id != ?", req.Email, user.ID).First(&existingUser).Error; err == nil {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{
					"error": "Email is already in use by another user",
				})
			}
			user.Email = req.Email
		}
	}

	// Hash password if provided
	if req.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to hash password",
			})
		}
		user.Password = string(hashedPassword)
	}

	// Update PhoneNumber and IsNotificationEnabled
	if req.IsNotificationEnabled != nil {
		user.IsNotificationEnabled = *req.IsNotificationEnabled
	}
	user.PhoneNumber = req.PhoneNumber

	// Validate if notification is enabled but phone is empty
	if user.IsNotificationEnabled && strings.TrimSpace(user.PhoneNumber) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Phone number is required when notifications are enabled",
		})
	}

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Save(&user).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update user",
		})
	}

	// Sync devices (clear old, insert new)
	if err := tx.Where("user_id = ?", user.ID).Delete(&model.UserDevice{}).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to clear old device assignments",
		})
	}

	// Assign new devices
	if len(req.DeviceIDs) > 0 {
		var userDevices []model.UserDevice
		for _, devID := range req.DeviceIDs {
			userDevices = append(userDevices, model.UserDevice{
				UserID:   user.ID,
				DeviceID: devID,
			})
		}
		if err := tx.Create(&userDevices).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to assign devices to user",
			})
		}
	}

	// Sync task categories (clear old, insert new)
	if err := tx.Where("user_id = ?", user.ID).Delete(&model.UserTaskCategory{}).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to clear old task category assignments",
		})
	}

	// Assign new task categories
	if len(req.TaskCategoryUUIDs) > 0 {
		var cats []model.TaskCategory
		if err := tx.Where("uuid IN ?", req.TaskCategoryUUIDs).Find(&cats).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to fetch task categories",
			})
		}
		if len(cats) != len(req.TaskCategoryUUIDs) {
			tx.Rollback()
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "One or more assigned task categories were not found",
			})
		}
		var userTaskCats []model.UserTaskCategory
		for _, cat := range cats {
			userTaskCats = append(userTaskCats, model.UserTaskCategory{
				UserID:         user.ID,
				TaskCategoryID: cat.ID,
			})
		}
		if err := tx.Create(&userTaskCats).Error; err != nil {
			tx.Rollback()
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to assign task categories to user",
			})
		}
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to commit transaction",
		})
	}

	// Load with assigned devices and task categories to return in response
	database.DB.Preload("Devices").Preload("TaskCategories").First(&user, user.ID)
	return c.JSON(user)
}

// DeleteUser handles DELETE /api/users/:uuid
func DeleteUser(c *fiber.Ctx) error {
	userUUID := c.Params("uuid")
	if userUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user UUID",
		})
	}

	var user model.User
	if err := database.DB.Where("uuid = ?", userUUID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	currentUserID := c.Locals("user_id").(uint64)
	currentUserRole := c.Locals("role").(string)

	// Self-deletion prevention
	if user.ID == currentUserID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "You cannot delete your own account",
		})
	}

	// Permission checks
	if currentUserRole != "superadmin" {
		if currentUserRole == "owner_subscriber" {
			// Can only delete their own sub-users
			if user.ParentID == nil || *user.ParentID != currentUserID {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error": "You do not have permission to delete this user",
				})
			}
		} else {
			// admin_subscriber or others cannot delete users
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "You do not have permission to delete users",
			})
		}
	}

	if err := database.DB.Delete(&user).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete user",
		})
	}

	return c.JSON(fiber.Map{
		"message": "User deleted successfully",
	})
}

type SubscriptionUpdateRequest struct {
	Tier string `json:"tier"`
}

// UpdateSubscription handles PUT /api/users/:uuid/subscription
func UpdateSubscription(c *fiber.Ctx) error {
	userUUID := c.Params("uuid")
	if userUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user UUID",
		})
	}

	var req SubscriptionUpdateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	tier := strings.ToLower(req.Tier)
	if tier != "free" && tier != "lite" && tier != "regular" && tier != "pro" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid subscription tier",
		})
	}

	var user model.User
	if err := database.DB.Where("uuid = ?", userUUID).First(&user).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	currentUserID := c.Locals("user_id").(uint64)
	currentUserRole := c.Locals("role").(string)

	if currentUserID != user.ID && currentUserRole != "superadmin" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You do not have permission to modify this user's subscription",
		})
	}

	user.SubscriptionTier = tier
	if tier == "free" {
		user.SubscriptionEndsAt = nil
	} else {
		endsAt := time.Now().AddDate(0, 1, 0)
		user.SubscriptionEndsAt = &endsAt
	}
	user.MessageResetAt = time.Now().AddDate(0, 1, 0)
	user.MonthlyMessageSent = 0

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Save(&user).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update subscription tier",
		})
	}

	// Propagate subscription updates to all team members of this user
	if err := tx.Model(&model.User{}).Where("parent_id = ?", user.ID).Updates(map[string]interface{}{
		"subscription_tier":    user.SubscriptionTier,
		"subscription_ends_at": user.SubscriptionEndsAt,
	}).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to propagate subscription update to team members",
		})
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to commit transaction",
		})
	}

	return c.JSON(user)
}
