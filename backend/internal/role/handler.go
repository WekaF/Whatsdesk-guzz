package role

import (
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type RoleRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type PermissionItem struct {
	MenuID    uint64 `json:"menu_id"`
	CanCreate bool   `json:"can_create"`
	CanRead   bool   `json:"can_read"`
	CanUpdate bool   `json:"can_update"`
	CanDelete bool   `json:"can_delete"`
}

type UpdatePermissionsRequest struct {
	Permissions []PermissionItem `json:"permissions"`
}

// ListRoles handles GET /api/roles
func ListRoles(c *fiber.Ctx) error {
	roleVal := c.Locals("role")
	roleName, _ := roleVal.(string)

	query := database.DB.Order("id asc")
	if roleName != "superadmin" {
		query = query.Where("name != ?", "superadmin")
	}

	var roles []model.Role
	if err := query.Find(&roles).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve roles",
		})
	}
	return c.JSON(roles)
}

// GetRole handles GET /api/roles/:uuid
func GetRole(c *fiber.Ctx) error {
	roleUUID := c.Params("uuid")
	if roleUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid role UUID",
		})
	}

	var role model.Role
	if err := database.DB.Where("uuid = ?", roleUUID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Role not found",
		})
	}
	return c.JSON(role)
}

// CreateRole handles POST /api/roles
func CreateRole(c *fiber.Ctx) error {
	var req RoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Role name is required",
		})
	}

	// Check if role name already exists
	var existingRole model.Role
	if err := database.DB.Where("name = ?", req.Name).First(&existingRole).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "Role name already exists",
		})
	}

	role := model.Role{
		Name:        req.Name,
		Description: req.Description,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := database.DB.Create(&role).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create role",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(role)
}

// UpdateRole handles PUT /api/roles/:uuid
func UpdateRole(c *fiber.Ctx) error {
	roleUUID := c.Params("uuid")
	if roleUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid role UUID",
		})
	}

	var req RoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	var role model.Role
	if err := database.DB.Where("uuid = ?", roleUUID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Role not found",
		})
	}

	// Prevent renaming core system roles to avoid breaking logic
	if role.Name == "superadmin" || role.Name == "owner_subscriber" || role.Name == "admin_subscriber" {
		if req.Name != "" && req.Name != role.Name {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Cannot rename system roles 'superadmin', 'owner_subscriber', or 'admin_subscriber'",
			})
		}
	}

	if req.Name != "" {
		// Check if another role is using the new name
		var existingRole model.Role
		if err := database.DB.Where("name = ? AND id != ?", req.Name, role.ID).First(&existingRole).Error; err == nil {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "Role name already in use by another role",
			})
		}
		role.Name = req.Name
	}

	role.Description = req.Description
	role.UpdatedAt = time.Now()

	if err := database.DB.Save(&role).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update role",
		})
	}

	return c.JSON(role)
}

// DeleteRole handles DELETE /api/roles/:uuid
func DeleteRole(c *fiber.Ctx) error {
	roleUUID := c.Params("uuid")
	if roleUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid role UUID",
		})
	}

	var role model.Role
	if err := database.DB.Where("uuid = ?", roleUUID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Role not found",
		})
	}

	// Prevent deletion of system roles
	if role.Name == "superadmin" || role.Name == "owner_subscriber" || role.Name == "admin_subscriber" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "System roles 'superadmin', 'owner_subscriber', and 'admin_subscriber' cannot be deleted",
		})
	}

	if err := database.DB.Delete(&role).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete role",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Role deleted successfully",
	})
}

// ListMenus handles GET /api/menus
func ListMenus(c *fiber.Ctx) error {
	var menus []model.Menu
	if err := database.DB.Order("sort_order asc").Find(&menus).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve menus",
		})
	}
	return c.JSON(menus)
}

// GetRolePermissions handles GET /api/roles/:uuid/permissions
func GetRolePermissions(c *fiber.Ctx) error {
	roleUUID := c.Params("uuid")
	if roleUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid role UUID",
		})
	}

	var role model.Role
	if err := database.DB.Where("uuid = ?", roleUUID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Role not found",
		})
	}

	// Fetch all menus first
	var menus []model.Menu
	if err := database.DB.Order("sort_order asc").Find(&menus).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch menus",
		})
	}

	// Fetch mapped permissions
	var rawPerms []model.RoleMenuPermission
	if err := database.DB.Where("role_id = ?", role.ID).Find(&rawPerms).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch role permissions",
		})
	}

	// Map them for quick lookup
	permMap := make(map[uint64]model.RoleMenuPermission)
	for _, p := range rawPerms {
		permMap[p.MenuID] = p
	}

	// Build response where every menu exists, even if not configured (default to false)
	type PermissionRespItem struct {
		MenuID    uint64 `json:"menu_id"`
		MenuKey   string `json:"menu_key"`
		MenuName  string `json:"menu_name"`
		CanCreate bool   `json:"can_create"`
		CanRead   bool   `json:"can_read"`
		CanUpdate bool   `json:"can_update"`
		CanDelete bool   `json:"can_delete"`
	}

	var response []PermissionRespItem
	for _, m := range menus {
		p, exists := permMap[m.ID]
		canCreate, canRead, canUpdate, canDelete := false, false, false, false
		if exists {
			canCreate = p.CanCreate
			canRead = p.CanRead
			canUpdate = p.CanUpdate
			canDelete = p.CanDelete
		}
		// Superadmin always has full access
		if role.Name == "superadmin" {
			canCreate, canRead, canUpdate, canDelete = true, true, true, true
		}

		response = append(response, PermissionRespItem{
			MenuID:    m.ID,
			MenuKey:   m.Key,
			MenuName:  m.Name,
			CanCreate: canCreate,
			CanRead:   canRead,
			CanUpdate: canUpdate,
			CanDelete: canDelete,
		})
	}

	return c.JSON(response)
}

// UpdateRolePermissions handles PUT /api/roles/:uuid/permissions
func UpdateRolePermissions(c *fiber.Ctx) error {
	roleUUID := c.Params("uuid")
	if roleUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid role UUID",
		})
	}

	var req UpdatePermissionsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	var role model.Role
	if err := database.DB.Where("uuid = ?", roleUUID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Role not found",
		})
	}

	// Prevent modification of superadmin role permissions (superadmin always has all permissions)
	if role.Name == "superadmin" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot modify permissions of 'superadmin' role",
		})
	}

	// Update permissions in a database transaction
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		// 1. Delete existing permissions for this role
		if err := tx.Where("role_id = ?", role.ID).Delete(&model.RoleMenuPermission{}).Error; err != nil {
			return err
		}

		// 2. Insert new permissions
		for _, p := range req.Permissions {
			// Skip saving if all flags are false (optimization)
			if !p.CanCreate && !p.CanRead && !p.CanUpdate && !p.CanDelete {
				continue
			}

			// Validate menu exists
			var menu model.Menu
			if err := tx.First(&menu, p.MenuID).Error; err != nil {
				return err
			}

			perm := model.RoleMenuPermission{
				RoleID:    role.ID,
				MenuID:    p.MenuID,
				CanCreate: p.CanCreate,
				CanRead:   p.CanRead,
				CanUpdate: p.CanUpdate,
				CanDelete: p.CanDelete,
			}
			if err := tx.Create(&perm).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update role permissions: " + err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "Role permissions updated successfully",
	})
}

// GetCurrentUserPermissions handles GET /api/auth/me/permissions
func GetCurrentUserPermissions(c *fiber.Ctx) error {
	roleVal := c.Locals("role")
	if roleVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}
	roleName := roleVal.(string)

	// Fetch all menus
	var menus []model.Menu
	if err := database.DB.Order("sort_order asc").Find(&menus).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve menus",
		})
	}

	type PermissionItemResp struct {
		ID        uint64 `json:"id"`
		Name      string `json:"name"`
		Key       string `json:"key"`
		Path      string `json:"path"`
		Icon      string `json:"icon"`
		SortOrder int    `json:"sort_order"`
		CanCreate bool   `json:"can_create"`
		CanRead   bool   `json:"can_read"`
		CanUpdate bool   `json:"can_update"`
		CanDelete bool   `json:"can_delete"`
	}

	var response []PermissionItemResp

	if roleName == "superadmin" {
		// Superadmin has all permissions on all menus
		for _, m := range menus {
			response = append(response, PermissionItemResp{
				ID:        m.ID,
				Name:      m.Name,
				Key:       m.Key,
				Path:      m.Path,
				Icon:      m.Icon,
				SortOrder: m.SortOrder,
				CanCreate: true,
				CanRead:   true,
				CanUpdate: true,
				CanDelete: true,
			})
		}
		return c.JSON(response)
	}

	// Fetch mapping for this role
	var rawPerms []model.RoleMenuPermission
	err := database.DB.Model(&model.RoleMenuPermission{}).
		Joins("JOIN roles ON roles.id = role_menu_permissions.role_id").
		Where("roles.name = ?", roleName).
		Find(&rawPerms).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve user permissions",
		})
	}

	permMap := make(map[uint64]model.RoleMenuPermission)
	for _, p := range rawPerms {
		permMap[p.MenuID] = p
	}

	for _, m := range menus {
		p, exists := permMap[m.ID]
		if exists && (p.CanCreate || p.CanRead || p.CanUpdate || p.CanDelete) {
			response = append(response, PermissionItemResp{
				ID:        m.ID,
				Name:      m.Name,
				Key:       m.Key,
				Path:      m.Path,
				Icon:      m.Icon,
				SortOrder: m.SortOrder,
				CanCreate: p.CanCreate,
				CanRead:   p.CanRead,
				CanUpdate: p.CanUpdate,
				CanDelete: p.CanDelete,
			})
		}
	}

	return c.JSON(response)
}
