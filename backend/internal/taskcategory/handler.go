package taskcategory

import (
	"strings"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type CategoryRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Color       string `json:"color"`
}

// ListTaskCategories handles GET /api/task-categories
func ListTaskCategories(c *fiber.Ctx) error {
	var categories []model.TaskCategory
	if err := database.DB.Order("name ASC").Find(&categories).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve task categories",
		})
	}
	return c.JSON(categories)
}

// CreateTaskCategory handles POST /api/task-categories
func CreateTaskCategory(c *fiber.Ctx) error {
	var req CategoryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Category name is required",
		})
	}

	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = "#6366f1" // default indigo
	}

	cat := model.TaskCategory{
		Name:        req.Name,
		Description: strings.TrimSpace(req.Description),
		Color:       color,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := database.DB.Create(&cat).Error; err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "A category with that name already exists",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create task category",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(cat)
}

// UpdateTaskCategory handles PUT /api/task-categories/:uuid
func UpdateTaskCategory(c *fiber.Ctx) error {
	uuidStr := c.Params("uuid")
	parsedUUID, err := uuid.Parse(uuidStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid UUID format",
		})
	}

	var cat model.TaskCategory
	if err := database.DB.Where("uuid = ?", parsedUUID).First(&cat).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Task category not found",
		})
	}

	var req CategoryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	if name := strings.TrimSpace(req.Name); name != "" {
		cat.Name = name
	}
	if desc := strings.TrimSpace(req.Description); desc != "" {
		cat.Description = desc
	}
	if color := strings.TrimSpace(req.Color); color != "" {
		cat.Color = color
	}
	cat.UpdatedAt = time.Now()

	if err := database.DB.Save(&cat).Error; err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "A category with that name already exists",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update task category",
		})
	}

	return c.JSON(cat)
}

// DeleteTaskCategory handles DELETE /api/task-categories/:uuid
func DeleteTaskCategory(c *fiber.Ctx) error {
	uuidStr := c.Params("uuid")
	parsedUUID, err := uuid.Parse(uuidStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid UUID format",
		})
	}

	var cat model.TaskCategory
	if err := database.DB.Where("uuid = ?", parsedUUID).First(&cat).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Task category not found",
		})
	}

	// Nullify FK on tasks and auto_replies before deleting (ON DELETE SET NULL handles it, but let's be explicit)
	if err := database.DB.Delete(&cat).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete task category",
		})
	}

	return c.JSON(fiber.Map{"message": "Task category deleted successfully"})
}
