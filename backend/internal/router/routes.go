package router

import (
	"whatapps/backend/configs"
	"whatapps/backend/internal/auth"
	"whatapps/backend/internal/autoreply"
	"whatapps/backend/internal/contact"
	"whatapps/backend/internal/device"
	"whatapps/backend/internal/integration"
	"whatapps/backend/internal/message"
	"whatapps/backend/internal/payment"
	"whatapps/backend/internal/role"
	"whatapps/backend/internal/stats"
	"whatapps/backend/internal/task"
	"whatapps/backend/internal/taskcategory"
	"whatapps/backend/internal/user"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/websocket/v2"
)

func SetupRoutes(app *fiber.App) {
	// Enable CORS for all routes (important for React frontend integration)
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, PUT, DELETE, OPTIONS",
	}))

	// Serve static uploads (both routes)
	cfg := configs.LoadConfig()
	app.Static("/uploads", cfg.UploadDir)

	// Health Check Endpoint
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"status":  "healthy",
			"message": "WhatsApp Gateway Backend API is running",
		})
	})

	// Inbound Integration Endpoint (Protected by API Key, no JWT)
	app.Post("/api/v1/integration/send", integration.APIKeyMiddleware(), integration.ApiKeyRateLimiter(), integration.SendIntegrationMessage)

	// Public Routes
	authGroup := app.Group("/auth")
	authGroup.Post("/register", auth.Register)
	authGroup.Post("/login", auth.Login)

	// Webhook callback endpoint for Midtrans (No JWT auth required)
	app.Post("/api/payments/webhook", payment.HandleWebhook)

	// Protected API Routes
	apiGroup := app.Group("/api", auth.JWTMiddleware())

	// Payment checkout endpoint (JWT auth required)
	apiGroup.Post("/payments/checkout", payment.Checkout)

	// Devices Routes
	devicesGroup := apiGroup.Group("/devices")
	devicesGroup.Post("/", auth.PermissionMiddleware("devices:create"), device.CreateDevice)
	devicesGroup.Get("/", auth.PermissionMiddleware("devices:read"), device.ListDevices)
	devicesGroup.Get("/:uuid", auth.PermissionMiddleware("devices:read"), device.GetDevice)
	devicesGroup.Post("/:uuid/disconnect", auth.PermissionMiddleware("devices:delete"), device.DisconnectDevice)
	// devicesGroup.Delete("/:uuid", auth.PermissionMiddleware("devices:delete"), device.DeleteDevice)

	// Messages Routes
	messagesGroup := apiGroup.Group("/messages")
	messagesGroup.Post("/send", auth.PermissionMiddleware([]string{"messages:create", "tasks:update"}), message.SendMessage)
	messagesGroup.Post("/upload", auth.PermissionMiddleware("messages:create"), message.UploadFile)
	messagesGroup.Get("/", auth.PermissionMiddleware([]string{"messages:read", "dashboard:read", "tasks:update"}), message.ListMessages)

	// Contacts Routes
	contactsGroup := apiGroup.Group("/contacts")
	contactsGroup.Get("/groups", auth.PermissionMiddleware("contacts:read"), contact.ListContactGroups)
	contactsGroup.Post("/import", auth.PermissionMiddleware("contacts:create"), contact.ImportWhatsAppContacts)
	contactsGroup.Get("/unsaved", auth.PermissionMiddleware("contacts:read"), contact.ListUnsavedSenders)
	contactsGroup.Post("/", auth.PermissionMiddleware("contacts:create"), contact.CreateContact)
	contactsGroup.Get("/", auth.PermissionMiddleware("contacts:read"), contact.ListContacts)
	contactsGroup.Put("/:uuid", auth.PermissionMiddleware("contacts:update"), contact.UpdateContact)
	contactsGroup.Delete("/:uuid", auth.PermissionMiddleware("contacts:delete"), contact.DeleteContact)

	// Tasks Routes
	tasksGroup := apiGroup.Group("/tasks")
	tasksGroup.Get("/assignees", auth.PermissionMiddleware("tasks:read"), task.ListAssignees)
	tasksGroup.Get("/", auth.PermissionMiddleware("tasks:read"), task.ListTasks)
	tasksGroup.Get("/:uuid", auth.PermissionMiddleware("tasks:read"), task.GetTask)
	tasksGroup.Put("/:uuid", auth.PermissionMiddleware("tasks:update"), task.UpdateTask)

	// Task Categories Routes
	taskCategoriesGroup := apiGroup.Group("/task-categories")
	taskCategoriesGroup.Get("/", auth.PermissionMiddleware("task-categories:read"), taskcategory.ListTaskCategories)
	taskCategoriesGroup.Post("/", auth.PermissionMiddleware("task-categories:create"), taskcategory.CreateTaskCategory)
	taskCategoriesGroup.Put("/:uuid", auth.PermissionMiddleware("task-categories:update"), taskcategory.UpdateTaskCategory)
	taskCategoriesGroup.Delete("/:uuid", auth.PermissionMiddleware("task-categories:delete"), taskcategory.DeleteTaskCategory)

	// Auto-Reply Routes
	autoRepliesGroup := apiGroup.Group("/auto-replies")
	autoRepliesGroup.Post("/", auth.PermissionMiddleware("auto-replies:create"), autoreply.CreateAutoReply)
	autoRepliesGroup.Get("/", auth.PermissionMiddleware("auto-replies:read"), autoreply.ListAutoReplies)
	autoRepliesGroup.Put("/:uuid", auth.PermissionMiddleware("auto-replies:update"), autoreply.UpdateAutoReply)
	autoRepliesGroup.Delete("/:uuid", auth.PermissionMiddleware("auto-replies:delete"), autoreply.DeleteAutoReply)

	// User Management Routes
	usersGroup := apiGroup.Group("/users")
	usersGroup.Get("/", auth.PermissionMiddleware("users:read"), user.ListUsers)
	usersGroup.Get("/:uuid", user.GetUser) // Ownership / Read permission handled internally in GetUser
	usersGroup.Post("/", auth.PermissionMiddleware("users:create"), user.CreateUser)
	usersGroup.Put("/:uuid", user.UpdateUser) // Ownership / Update permission handled internally in UpdateUser
	usersGroup.Put("/:uuid/subscription", user.UpdateSubscription)
	usersGroup.Delete("/:uuid", auth.PermissionMiddleware("users:delete"), user.DeleteUser)

	// Role & Menu/Permission Routes
	rolesGroup := apiGroup.Group("/roles")
	rolesGroup.Get("/", auth.PermissionMiddleware([]string{"roles:read", "users:read"}), role.ListRoles)
	rolesGroup.Get("/:uuid", auth.PermissionMiddleware("roles:read"), role.GetRole)
	rolesGroup.Post("/", auth.PermissionMiddleware("roles:create"), role.CreateRole)
	rolesGroup.Put("/:uuid", auth.PermissionMiddleware("roles:update"), role.UpdateRole)
	rolesGroup.Delete("/:uuid", auth.PermissionMiddleware("roles:delete"), role.DeleteRole)
	rolesGroup.Get("/:uuid/permissions", auth.PermissionMiddleware("roles:read"), role.GetRolePermissions)
	rolesGroup.Put("/:uuid/permissions", auth.PermissionMiddleware("roles:update"), role.UpdateRolePermissions)

	// Integrations/API Key CRUD Routes
	integrationsGroup := apiGroup.Group("/integrations")
	integrationsGroup.Get("/", auth.PermissionMiddleware("integrasi:read"), integration.ListApiKeys)
	integrationsGroup.Post("/", auth.PermissionMiddleware("integrasi:create"), integration.CreateApiKey)
	integrationsGroup.Put("/:uuid/toggle", auth.PermissionMiddleware("integrasi:update"), integration.ToggleApiKeyActive)
	// integrationsGroup.Delete("/:uuid", auth.PermissionMiddleware("integrasi:delete"), integration.DeleteApiKey)
	integrationsGroup.Get("/:uuid/logs", auth.PermissionMiddleware("integrasi:read"), integration.GetApiKeyLogs)

	menusGroup := apiGroup.Group("/menus")
	menusGroup.Get("/", role.ListMenus) // Any logged-in user can fetch menus list

	// Permissions for currently logged-in user (for frontend sidebar)
	apiGroup.Get("/auth/me/permissions", role.GetCurrentUserPermissions)

	// Stats Routes
	statsGroup := apiGroup.Group("/stats")
	statsGroup.Get("/queue", auth.PermissionMiddleware("dashboard:read"), stats.GetQueueStats)
	statsGroup.Get("/tasks", auth.PermissionMiddleware("dashboard:read"), stats.GetTaskStats)

	// WebSocket Gateway Route
	// Upgrade connection checks
	app.Use("/devices/:uuid/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	app.Get("/devices/:uuid/ws", websocket.New(device.WebSocketHandler, websocket.Config{
		Origins: []string{"*"},
	}))
}
