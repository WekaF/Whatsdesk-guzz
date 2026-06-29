package auth

import (
	"strings"

	"whatapps/backend/configs"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

func JWTMiddleware() fiber.Handler {
	cfg := configs.LoadConfig()

	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing authorization token",
			})
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid authorization header format",
			})
		}

		tokenString := parts[1]
		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid or expired authorization token",
			})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Failed to parse token claims",
			})
		}

		// Save user information to locals
		userID, ok := claims["user_id"].(float64)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Invalid token claims payload",
			})
		}

		c.Locals("user_id", uint64(userID))
		c.Locals("role", claims["role"].(string))

		return c.Next()
	}
}

func PermissionMiddleware(requiredPermissions ...any) fiber.Handler {
	return func(c *fiber.Ctx) error {
		roleVal := c.Locals("role")
		if roleVal == nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Unauthorized role access",
			})
		}
		roleName, ok := roleVal.(string)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Invalid role type",
			})
		}

		// Admin override: superadmins can access everything
		if roleName == "superadmin" {
			return c.Next()
		}

		// Flatten the required permissions (can be strings or []string)
		var perms []string
		for _, p := range requiredPermissions {
			switch v := p.(type) {
			case string:
				perms = append(perms, v)
			case []string:
				perms = append(perms, v...)
			}
		}

		if len(perms) == 0 {
			return c.Next()
		}

		// Retrieve all permissions for this role
		type PermItem struct {
			MenuKey   string `gorm:"column:key"`
			CanCreate bool   `gorm:"column:can_create"`
			CanRead   bool   `gorm:"column:can_read"`
			CanUpdate bool   `gorm:"column:can_update"`
			CanDelete bool   `gorm:"column:can_delete"`
		}
		var permissions []PermItem

		err := database.DB.Table("role_menu_permissions").
			Select("menus.key, role_menu_permissions.can_create, role_menu_permissions.can_read, role_menu_permissions.can_update, role_menu_permissions.can_delete").
			Joins("JOIN roles ON roles.id = role_menu_permissions.role_id").
			Joins("JOIN menus ON menus.id = role_menu_permissions.menu_id").
			Where("roles.name = ?", roleName).
			Scan(&permissions).Error

		if err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Failed to authorize permissions",
			})
		}

		// Create a quick lookup map
		permMap := make(map[string]map[string]bool)
		for _, p := range permissions {
			permMap[p.MenuKey] = map[string]bool{
				"create": p.CanCreate,
				"read":   p.CanRead,
				"update": p.CanUpdate,
				"delete": p.CanDelete,
			}
		}

		// We check if the user has AT LEAST ONE of the required permissions (OR condition)
		hasPermission := false
		for _, req := range perms {
			parts := strings.Split(req, ":")
			if len(parts) != 2 {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error": "Invalid permission format",
				})
			}
			menu := parts[0]
			action := parts[1]

			actions, exists := permMap[menu]
			if exists && actions[action] {
				hasPermission = true
				break
			}
		}

		if !hasPermission {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "You do not have permission to access this resource",
			})
		}

		return c.Next()
	}
}
