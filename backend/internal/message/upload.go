package message

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"whatapps/backend/configs"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// UploadFile handles incoming multipart file uploads and saves them locally.
func UploadFile(c *fiber.Ctx) error {
	// 1. Ensure uploads directory exists
	cfg := configs.LoadConfig()
	uploadDir := cfg.UploadDir
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to create uploads directory",
			})
		}
	}

	// 2. Retrieve file from multipart form
	file, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "No file uploaded or invalid payload",
		})
	}

	// 3. Determine message/media type based on extension or mime-type
	ext := strings.ToLower(filepath.Ext(file.Filename))
	var messageType string
	if ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".gif" || ext == ".webp" {
		messageType = "image"
	} else {
		messageType = "document" // Defaults to document (PDF, docx, etc.)
	}

	// 4. Generate unique filename to avoid duplicates/collisions
	uID, err := uuid.NewRandom()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to generate unique file identifier",
		})
	}
	uniqueName := fmt.Sprintf("%s%s", uID.String(), ext)
	filePath := filepath.Join(uploadDir, uniqueName)

	// 5. Save the file to the uploads directory
	if err := c.SaveFile(file, filePath); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fmt.Sprintf("Failed to save uploaded file: %v", err),
		})
	}

	// 6. Return resource details to the client
	// Serving URL path points to the local static uploads server endpoint, adapted with domain name if available.
	baseURL := cfg.AppURL
	if baseURL == "" {
		baseURL = c.BaseURL()
	}
	baseURL = strings.TrimSuffix(baseURL, "/")
	fileURL := fmt.Sprintf("%s/uploads/%s", baseURL, uniqueName)
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"url":          fileURL,
		"file_name":    file.Filename,
		"message_type": messageType,
	})
}
