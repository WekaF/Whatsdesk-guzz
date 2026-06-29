package contact

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
)

type UnsavedSender struct {
	Phone           string    `json:"phone"`
	DeviceID        uint64    `json:"device_id"`
	DeviceName      string    `json:"device_name"`
	LastMessageText string    `json:"last_message_text"`
	LastMessageAt   time.Time `json:"last_message_at"`
}

func ListUnsavedSenders(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
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

	// 1. Resolve active devices for this user
	var deviceIDs []uint64
	if role == "superadmin" {
		if err := database.DB.Model(&model.Device{}).Pluck("id", &deviceIDs).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to resolve devices",
			})
		}
	} else {
		if err := database.DB.Table("user_devices").Where("user_id = ?", userID).Pluck("device_id", &deviceIDs).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "Failed to resolve assigned devices",
			})
		}
	}

	if len(deviceIDs) == 0 {
		return c.JSON(fiber.Map{
			"data":        []UnsavedSender{},
			"total":       0,
			"page":        page,
			"limit":       limit,
			"total_pages": 1,
		})
	}

	// 2. Fetch all contacts phone numbers for this user to filter them out
	var contactPhones []string
	var contactErr error
	if role == "superadmin" {
		contactErr = database.DB.Model(&model.Contact{}).Pluck("phone", &contactPhones).Error
	} else {
		contactErr = database.DB.Model(&model.Contact{}).
			Where("device_id IN ? OR (device_id IS NULL AND user_id = ?)", deviceIDs, userID).
			Pluck("phone", &contactPhones).Error
	}
	if contactErr != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch contact directory",
		})
	}

	// Make a set of saved phones for fast check
	savedPhonesMap := make(map[string]bool)
	for _, p := range contactPhones {
		// Keep only digits
		clean := ""
		for _, char := range p {
			if char >= '0' && char <= '9' {
				clean += string(char)
			}
		}
		if clean != "" {
			savedPhonesMap[clean] = true
		}
	}

	// 3. Fetch incoming messages grouped by phone
	type TempMessage struct {
		Phone     string    `gorm:"column:phone"`
		DeviceID  uint64    `gorm:"column:device_id"`
		Message   string    `gorm:"column:message"`
		CreatedAt time.Time `gorm:"column:created_at"`
	}

	// We get the latest message for each phone number using DISTINCT ON (split_part(phone, '@', 1))
	var rawMsgs []TempMessage
	err = database.DB.Raw(`
		SELECT DISTINCT ON (split_part(COALESCE(whatsmeow_lid_map.pn, m.phone), '@', 1)) 
			COALESCE(whatsmeow_lid_map.pn, m.phone) as phone,
			m.device_id, m.message, m.created_at
		FROM messages m
		LEFT JOIN whatsmeow_lid_map ON split_part(whatsmeow_lid_map.lid, '@', 1) = split_part(m.phone, '@', 1)
		WHERE m.direction = 'IN' 
		  AND m.device_id IN ? 
		  AND (m.phone LIKE '%@s.whatsapp.net' OR m.phone LIKE '%@lid' OR m.phone NOT LIKE '%@%')
		ORDER BY split_part(COALESCE(whatsmeow_lid_map.pn, m.phone), '@', 1), m.created_at DESC
	`, deviceIDs).Scan(&rawMsgs).Error

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to query messages: " + err.Error(),
		})
	}

	// 4. Fetch device names map to resolve DeviceName
	var devices []model.Device
	if err := database.DB.Where("id IN ?", deviceIDs).Find(&devices).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch devices details",
		})
	}
	deviceNames := make(map[uint64]string)
	for _, d := range devices {
		deviceNames[d.ID] = d.DeviceName
	}

	// Filter and construct UnsavedSender slice
	var unsavedSenders []UnsavedSender
	for _, m := range rawMsgs {
		parts := strings.Split(m.Phone, "@")
		phoneDigits := parts[0]
		cleanPhone := ""
		for _, char := range phoneDigits {
			if char >= '0' && char <= '9' {
				cleanPhone += string(char)
			}
		}

		if cleanPhone == "" {
			continue
		}

		// Skip if already in contacts list
		if savedPhonesMap[cleanPhone] {
			continue
		}

		unsavedSenders = append(unsavedSenders, UnsavedSender{
			Phone:           cleanPhone,
			DeviceID:        m.DeviceID,
			DeviceName:      deviceNames[m.DeviceID],
			LastMessageText: m.Message,
			LastMessageAt:   m.CreatedAt,
		})
	}

	// Sort unsavedSenders by LastMessageAt desc
	sort.Slice(unsavedSenders, func(i, j int) bool {
		return unsavedSenders[i].LastMessageAt.After(unsavedSenders[j].LastMessageAt)
	})

	// Paginating in-memory
	total := len(unsavedSenders)
	totalPages := int(math.Ceil(float64(total) / float64(limit)))
	if totalPages == 0 {
		totalPages = 1
	}

	offset := (page - 1) * limit
	var paginated []UnsavedSender
	if offset < total {
		end := offset + limit
		if end > total {
			end = total
		}
		paginated = unsavedSenders[offset:end]
	} else {
		paginated = []UnsavedSender{}
	}

	return c.JSON(fiber.Map{
		"data":        paginated,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}
