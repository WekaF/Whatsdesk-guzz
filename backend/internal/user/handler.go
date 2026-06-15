package user

import (
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
	var users []model.User
	if err := database.DB.Order("id asc").Preload("Devices").Preload("TaskCategories").Find(&users).Error; err != nil {
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

	// Authorization check: owner, admin, or user with 'read' permission on 'users' menu
	if currentUserID != user.ID && currentUserRole != "admin" {
		var count int64
		err := database.DB.Model(&model.RoleMenuPermission{}).
			Joins("JOIN roles ON roles.id = role_menu_permissions.role_id").
			Joins("JOIN menus ON menus.id = role_menu_permissions.menu_id").
			Where("roles.name = ? AND menus.key = ? AND role_menu_permissions.can_read = ?", currentUserRole, "users", true).
			Count(&count).Error

		if err != nil || count == 0 {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "You do not have permission to access this user's details",
			})
		}
	}

	return c.JSON(user)
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

	// Verify if the role exists
	var role model.Role
	if err := database.DB.Where("name = ?", req.Role).First(&role).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Role does not exist",
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

	// Authorization check: owner, admin, or user with 'update' permission on 'users' menu
	hasUpdatePermission := false
	if currentUserRole == "admin" {
		hasUpdatePermission = true
	} else {
		var count int64
		err := database.DB.Model(&model.RoleMenuPermission{}).
			Joins("JOIN roles ON roles.id = role_menu_permissions.role_id").
			Joins("JOIN menus ON menus.id = role_menu_permissions.menu_id").
			Where("roles.name = ? AND menus.key = ? AND role_menu_permissions.can_update = ?", currentUserRole, "users", true).
			Count(&count).Error
		if err == nil && count > 0 {
			hasUpdatePermission = true
		}
	}

	if currentUserID != user.ID && !hasUpdatePermission {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You do not have permission to update this user's profile",
		})
	}

	// Validation: cannot change role unless user has 'update' permission on 'users'
	if req.Role != "" && req.Role != user.Role && !hasUpdatePermission {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "You do not have permission to change user roles",
		})
	}

	// If updating role, check if it exists in the database
	if req.Role != "" && req.Role != user.Role {
		var role model.Role
		if err := database.DB.Where("name = ?", req.Role).First(&role).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Assigned role does not exist",
			})
		}
		user.Role = req.Role
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

	// Self-deletion prevention
	if user.ID == currentUserID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "You cannot delete your own account",
		})
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
