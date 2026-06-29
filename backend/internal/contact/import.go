package contact

import (
	"fmt"
	"strings"
	"time"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"go.mau.fi/whatsmeow/types"
)

type ImportRequest struct {
	DeviceID uint64 `json:"device_id"`
	Group    string `json:"group"`
}

type WhatsmeowContact struct {
	OurJID       string `gorm:"column:our_jid"`
	TheirJID     string `gorm:"column:their_jid"`
	FirstName    string `gorm:"column:first_name"`
	FullName     string `gorm:"column:full_name"`
	PushName     string `gorm:"column:push_name"`
	BusinessName string `gorm:"column:business_name"`
}

func ImportWhatsAppContacts(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)

	var req ImportRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	if req.DeviceID == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Device ID is required",
		})
	}

	// Fetch device info to verify user ownership
	var device model.Device
	var dbErr error
	if role == "superadmin" {
		dbErr = database.DB.Where("id = ?", req.DeviceID).First(&device).Error
	} else {
		dbErr = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
			Where("devices.id = ? AND user_devices.user_id = ?", req.DeviceID, userID).
			First(&device).Error
	}
	if dbErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Device not found or not owned by user",
		})
	}

	// If device JID is empty, we don't have its identity synced yet
	if device.JID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Device is not fully connected yet (empty JID). Connect the device first.",
		})
	}

	// Parse bare JID for this device to ensure we match correctly
	var bareJID string
	deviceJID, err := types.ParseJID(device.JID)
	if err == nil {
		bareJID = deviceJID.ToNonAD().String()
	} else {
		bareJID = device.JID
	}

	// Fetch contacts from whatsmeow_contacts table matching the device JID or bare JID
	var wContacts []WhatsmeowContact
	err = database.DB.Table("whatsmeow_contacts").
		Where("our_jid = ? OR our_jid = ?", device.JID, bareJID).
		Find(&wContacts).Error
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to query WhatsApp contacts from store: " + err.Error(),
		})
	}

	// Resolve contact owner ID(s)
	var ownerIDs []uint64
	if err := database.DB.Table("user_devices").Where("device_id = ?", req.DeviceID).Pluck("user_id", &ownerIDs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to resolve device owners: " + err.Error(),
		})
	}
	if len(ownerIDs) == 0 {
		ownerIDs = []uint64{userID}
	}

	// Pull all existing contacts for this user to optimize checks in memory
	var existingContacts []model.Contact
	if err := database.DB.Where("user_id IN ?", ownerIDs).Find(&existingContacts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch existing local contacts: " + err.Error(),
		})
	}

	existingMap := make(map[string]bool)
	for _, ec := range existingContacts {
		existingMap[fmt.Sprintf("%d_%s", ec.UserID, ec.Phone)] = true
	}

	// Set default group label
	groupLabel := strings.TrimSpace(req.Group)
	if groupLabel == "" {
		groupLabel = "WhatsApp Import"
	}

	importedCount := 0
	skippedCount := 0

	for _, wc := range wContacts {
		// Only import individual WhatsApp JIDs (ending with @s.whatsapp.net)
		if !strings.HasSuffix(wc.TheirJID, "@s.whatsapp.net") {
			continue
		}

		// Skip if it's the device's own number (self)
		if wc.TheirJID == bareJID || wc.TheirJID == device.JID {
			continue
		}

		// Extract phone digits
		parts := strings.Split(wc.TheirJID, "@")
		phoneDigits := parts[0]

		// Filter to keep only numeric digits just in case
		cleanPhone := ""
		for _, char := range phoneDigits {
			if char >= '0' && char <= '9' {
				cleanPhone += string(char)
			}
		}

		if cleanPhone == "" || cleanPhone == device.Phone {
			continue
		}

		// Determine display name
		displayName := ""
		if wc.FullName != "" {
			displayName = wc.FullName
		} else if wc.BusinessName != "" {
			displayName = wc.BusinessName
		} else if wc.PushName != "" {
			displayName = wc.PushName
		} else if wc.FirstName != "" {
			displayName = wc.FirstName
		} else {
			displayName = "+" + cleanPhone
		}

		isImportedForAny := false
		isSkippedForAny := false

		for _, ownerID := range ownerIDs {
			mapKey := fmt.Sprintf("%d_%s", ownerID, cleanPhone)
			if existingMap[mapKey] {
				isSkippedForAny = true
				continue
			}

			contact := model.Contact{
				UserID:    ownerID,
				DeviceID:  &req.DeviceID,
				Name:      displayName,
				Phone:     cleanPhone,
				Group:     groupLabel,
				CreatedAt: time.Now(),
			}

			if err := database.DB.Create(&contact).Error; err != nil {
				isSkippedForAny = true
				continue
			}

			existingMap[mapKey] = true
			isImportedForAny = true
		}

		if isImportedForAny {
			importedCount++
		} else if isSkippedForAny {
			skippedCount++
		}
	}

	return c.JSON(fiber.Map{
		"success":  true,
		"imported": importedCount,
		"skipped":  skippedCount,
		"total":    len(wContacts),
	})
}
