package device

import (
	"time"
	"whatapps/backend/internal/model"
	"whatapps/backend/internal/whatsapp"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
)

type CreateDeviceRequest struct {
	DeviceName string `json:"device_name" form:"device_name"`
}

func CreateDevice(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)

	var req CreateDeviceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	if req.DeviceName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Device name is required",
		})
	}

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	device := model.Device{
		DeviceName: req.DeviceName,
		Status:     "DISCONNECTED",
	}

	if err := tx.Create(&device).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create device",
		})
	}

	userDevice := model.UserDevice{
		UserID:   userID,
		DeviceID: device.ID,
	}

	if err := tx.Create(&userDevice).Error; err != nil {
		tx.Rollback()
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to map user to device",
		})
	}

	if err := tx.Commit().Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to commit transaction",
		})
	}

	return c.Status(fiber.StatusCreated).JSON(device)
}

func ListDevices(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)

	var devices []model.Device
	var err error
	if role == "admin" {
		err = database.DB.Find(&devices).Error
	} else {
		err = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
			Where("user_devices.user_id = ?", userID).
			Find(&devices).Error
	}

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve devices",
		})
	}

	return c.JSON(devices)
}

func GetDevice(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	deviceUUID := c.Params("uuid")

	if deviceUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid device UUID",
		})
	}

	var device model.Device
	var dbErr error
	if role == "admin" {
		dbErr = database.DB.Where("uuid = ?", deviceUUID).First(&device).Error
	} else {
		dbErr = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
			Where("devices.uuid = ? AND user_devices.user_id = ?", deviceUUID, userID).
			First(&device).Error
	}
	if dbErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Device not found",
		})
	}

	return c.JSON(device)
}

func DeleteDevice(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	deviceUUID := c.Params("uuid")

	if deviceUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid device UUID",
		})
	}

	var device model.Device
	var dbErr error
	if role == "admin" {
		dbErr = database.DB.Where("uuid = ?", deviceUUID).First(&device).Error
	} else {
		dbErr = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
			Where("devices.uuid = ? AND user_devices.user_id = ?", deviceUUID, userID).
			First(&device).Error
	}
	if dbErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Device not found",
		})
	}

	// Delete from DB (onDelete cascade handles dependent rows)
	if err := database.DB.Delete(&device).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete device",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Device deleted successfully",
	})
}

func GetDeviceQR(c *fiber.Ctx) error {
	uuidParam := c.Params("uuid")

	var device model.Device
	if err := database.DB.Where("uuid = ?", uuidParam).First(&device).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "device not found"})
	}

	// Verify ownership
	userID, ok := c.Locals("user_id").(uint64)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid user context"})
	}
	var count int64
	database.DB.Table("user_devices").
		Where("user_id = ? AND device_id = ?", userID, device.ID).
		Count(&count)
	if count == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied"})
	}

	if device.Status == "CONNECTED" {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"connected": true, "qr": nil})
	}

	qr, err := whatsapp.Manager.GetQROnce(device.ID, 30*time.Second)
	if err != nil {
		if err.Error() == "device already connected" {
			return c.Status(fiber.StatusOK).JSON(fiber.Map{"connected": true, "qr": nil})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"connected": false, "qr": qr})
}
