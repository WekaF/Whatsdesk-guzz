package contact

import (
	"log"
	"math"
	"strconv"
	"strings"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
)

type ContactRequest struct {
	Name     string   `json:"name" form:"name"`
	Phone    string   `json:"phone" form:"phone"`
	Group    string   `json:"group" form:"group"`
	DeviceID *uint64  `json:"device_id" form:"device_id"`
}

func CreateContact(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)

	var req ContactRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Group = strings.TrimSpace(req.Group)

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Contact name is required",
		})
	}

	if req.Phone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Phone number is required",
		})
	}

	// Clean phone number (keep only digits)
	phoneDigits := ""
	for _, char := range req.Phone {
		if char >= '0' && char <= '9' {
			phoneDigits += string(char)
		}
	}
	if phoneDigits == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid phone number format",
		})
	}

	// Verify device ownership for non-admin users if a device ID is specified
	if req.DeviceID != nil {
		role := c.Locals("role").(string)
		if role != "admin" {
			var count int64
			err := database.DB.Table("user_devices").Where("user_id = ? AND device_id = ?", userID, *req.DeviceID).Count(&count).Error
			if err != nil || count == 0 {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error": "Selected device is not assigned to you",
				})
			}
		}
	}

	// Check if contact already exists for this user
	var existing model.Contact
	if err := database.DB.Where("user_id = ? AND phone = ?", userID, phoneDigits).First(&existing).Error; err == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "A contact with this phone number already exists",
		})
	}

	contact := model.Contact{
		UserID:   userID,
		DeviceID: req.DeviceID,
		Name:     req.Name,
		Phone:    phoneDigits,
		Group:    req.Group,
	}

	if err := database.DB.Create(&contact).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create contact",
		})
	}

	syncContactToWhatsmeow(contact)

	return c.Status(fiber.StatusCreated).JSON(contact)
}

func ListContacts(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	searchQuery := c.Query("q")
	groupFilter := c.Query("group")
	pageStr := c.Query("page", "1")
	limitStr := c.Query("limit", "20")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		page = 1
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 20
	}

	query := database.DB.Model(&model.Contact{})
	if role != "admin" {
		query = query.Where("contacts.device_id IN (SELECT device_id FROM user_devices WHERE user_id = ?) OR (contacts.device_id IS NULL AND contacts.user_id = ?)", userID, userID)
	}

	if searchQuery != "" {
		q := "%" + strings.ToLower(searchQuery) + "%"
		query = query.Where("(LOWER(name) LIKE ? OR phone LIKE ? OR LOWER(\"group\") LIKE ?)", q, q, q)
	}

	if groupFilter != "" {
		query = query.Where("LOWER(\"group\") = ?", strings.ToLower(groupFilter))
	}

	// Get total count
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve contacts count",
		})
	}

	// Apply pagination
	offset := (page - 1) * limit
	var contacts []model.Contact
	if err := query.Preload("Device").Order("name ASC").Offset(offset).Limit(limit).Find(&contacts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve contacts",
		})
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))
	if totalPages == 0 {
		totalPages = 1
	}

	return c.JSON(fiber.Map{
		"data":        contacts,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

func ListContactGroups(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)

	query := database.DB.Model(&model.Contact{}).Where("\"group\" IS NOT NULL AND \"group\" != ''")
	if role != "admin" {
		query = query.Where("contacts.device_id IN (SELECT device_id FROM user_devices WHERE user_id = ?) OR (contacts.device_id IS NULL AND contacts.user_id = ?)", userID, userID)
	}

	var groups []string
	if err := query.Distinct("\"group\"").Pluck("\"group\"", &groups).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve contact groups",
		})
	}
	return c.JSON(groups)
}

func UpdateContact(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	contactUUID := c.Params("uuid")

	if contactUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid contact UUID",
		})
	}

	var req ContactRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Group = strings.TrimSpace(req.Group)

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Contact name is required",
		})
	}

	if req.Phone == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Phone number is required",
		})
	}

	// Clean phone number
	phoneDigits := ""
	for _, char := range req.Phone {
		if char >= '0' && char <= '9' {
			phoneDigits += string(char)
		}
	}
	if phoneDigits == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid phone number format",
		})
	}

	// Verify device ownership for non-admin users if a new device ID is specified
	if req.DeviceID != nil && role != "admin" {
		var count int64
		err := database.DB.Table("user_devices").Where("user_id = ? AND device_id = ?", userID, *req.DeviceID).Count(&count).Error
		if err != nil || count == 0 {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "Selected device is not assigned to you",
			})
		}
	}

	// Check if contact exists and belongs to the user
	var contact model.Contact
	var dbErr error
	if role == "admin" {
		dbErr = database.DB.Where("uuid = ?", contactUUID).First(&contact).Error
	} else {
		dbErr = database.DB.Where("uuid = ? AND (device_id IN (SELECT device_id FROM user_devices WHERE user_id = ?) OR (device_id IS NULL AND user_id = ?))", contactUUID, userID, userID).First(&contact).Error
	}
	if dbErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Contact not found",
		})
	}

	// Check if another contact exists with the new phone number
	if phoneDigits != contact.Phone {
		var duplicate model.Contact
		var dupErr error
		if role == "admin" {
			dupErr = database.DB.Where("phone = ? AND id != ?", phoneDigits, contact.ID).First(&duplicate).Error
		} else {
			dupErr = database.DB.Where("phone = ? AND id != ? AND user_id = ?", phoneDigits, contact.ID, userID).First(&duplicate).Error
		}
		if dupErr == nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Another contact with this phone number already exists",
			})
		}
	}

	contact.Name = req.Name
	contact.Phone = phoneDigits
	contact.Group = req.Group
	contact.DeviceID = req.DeviceID

	if err := database.DB.Save(&contact).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update contact",
		})
	}

	syncContactToWhatsmeow(contact)

	return c.JSON(contact)
}

func DeleteContact(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	contactUUID := c.Params("uuid")

	if contactUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid contact UUID",
		})
	}

	// Check if contact exists and belongs to the user
	var contact model.Contact
	var dbErr error
	if role == "admin" {
		dbErr = database.DB.Where("uuid = ?", contactUUID).First(&contact).Error
	} else {
		dbErr = database.DB.Where("uuid = ? AND (device_id IN (SELECT device_id FROM user_devices WHERE user_id = ?) OR (device_id IS NULL AND user_id = ?))", contactUUID, userID, userID).First(&contact).Error
	}
	if dbErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Contact not found",
		})
	}

	if err := database.DB.Delete(&contact).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete contact",
		})
	}

	return c.JSON(fiber.Map{
		"message": "Contact deleted successfully",
	})
}

func syncContactToWhatsmeow(contact model.Contact) {
	go func() {
		var devices []model.Device
		if contact.DeviceID != nil {
			var d model.Device
			if err := database.DB.First(&d, *contact.DeviceID).Error; err == nil && d.JID != "" {
				devices = append(devices, d)
			}
		} else {
			var userDevices []uint64
			database.DB.Table("user_devices").Where("user_id = ?", contact.UserID).Pluck("device_id", &userDevices)
			if len(userDevices) > 0 {
				database.DB.Where("id IN ? AND jid != ''", userDevices).Find(&devices)
			}
		}

		theirJID := contact.Phone + "@s.whatsapp.net"
		for _, d := range devices {
			err := database.DB.Exec(`
				INSERT INTO whatsmeow_contacts (our_jid, their_jid, first_name, full_name)
				VALUES (?, ?, ?, ?)
				ON CONFLICT (our_jid, their_jid) DO UPDATE 
				SET first_name = EXCLUDED.first_name, full_name = EXCLUDED.full_name
			`, d.JID, theirJID, contact.Name, contact.Name).Error
			if err != nil {
				log.Printf("Failed to sync contact to whatsmeow_contacts for device %d: %v", d.ID, err)
			}
		}
	}()
}
