package task

import (
	"log"
	"math"
	"strconv"
	"strings"
	"time"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type UpdateTaskRequest struct {
	Status       string  `json:"status"`
	CategoryUUID string  `json:"category_uuid"`
	Description  *string `json:"description"`
	PICUserID    *string `json:"pic_user_id"`
}

// ListTasks handles GET /api/tasks
func ListTasks(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)

	statusFilter := c.Query("status") // e.g. "Open", "Closed", "Active" (Open, On Progress, On Hold)
	deviceIDStr := c.Query("device_id")
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

	// Parse sort and order safely
	sortField := "updated_at"
	if qSort := c.Query("sort"); qSort == "number" || qSort == "created_at" || qSort == "status" || qSort == "id" || qSort == "updated_at" {
		sortField = qSort
	}
	sortOrder := "desc"
	if qOrder := strings.ToLower(c.Query("order")); qOrder == "asc" || qOrder == "desc" {
		sortOrder = qOrder
	}
	orderClause := sortField + " " + sortOrder

	// 1. Resolve active devices for this user
	var deviceIDs []uint64
	if role == "admin" {
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
			"data":        []model.Task{},
			"total":       0,
			"page":        page,
			"limit":       limit,
			"total_pages": 1,
		})
	}

	var user model.User
	if err := database.DB.Preload("TaskCategories").First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to resolve user task categories",
		})
	}

	query := database.DB.Model(&model.Task{}).Where("device_id IN ?", deviceIDs)

	if len(user.TaskCategories) > 0 {
		var catIDs []uint64
		for _, cat := range user.TaskCategories {
			catIDs = append(catIDs, cat.ID)
		}
		query = query.Where("category_id IN ?", catIDs)
	}

	if deviceIDStr != "" {
		if devID, err := strconv.ParseUint(deviceIDStr, 10, 64); err == nil {
			query = query.Where("device_id = ?", devID)
		}
	}

	if statusFilter != "" {
		if strings.ToLower(statusFilter) == "active" {
			query = query.Where("status IN ?", []string{"Open", "On Progress", "On Hold"})
		} else {
			query = query.Where("status = ?", statusFilter)
		}
	}

	// Filter by category UUID
	if categoryUUID := c.Query("category_uuid"); categoryUUID != "" {
		var cat model.TaskCategory
		if err := database.DB.Where("uuid = ?", categoryUUID).First(&cat).Error; err == nil {
			query = query.Where("category_id = ?", cat.ID)
		}
	}

	// Filter by assignee
	if updatedBy := c.Query("updated_by"); updatedBy != "" {
		query = query.Where("updated_by = ?", updatedBy)
	}

	// Filter by unassigned
	if unassigned := c.Query("unassigned"); unassigned == "true" {
		query = query.Where("updated_by IS NULL OR updated_by = ''")
	}

	// Filter by date range
	if startDate := c.Query("start_date"); startDate != "" {
		query = query.Where("created_at >= ?", startDate)
	}
	if endDate := c.Query("end_date"); endDate != "" {
		if len(endDate) == 10 {
			query = query.Where("created_at <= ?", endDate+" 23:59:59")
		} else {
			query = query.Where("created_at <= ?", endDate)
		}
	}

	// Filter by search query (q) - search in number, phone, trigger_msg, description
	if searchQuery := c.Query("q"); searchQuery != "" {
		searchTerm := "%" + strings.ToLower(searchQuery) + "%"
		query = query.Where(
			"LOWER(number) LIKE ? OR LOWER(phone) LIKE ? OR LOWER(trigger_msg) LIKE ? OR LOWER(description) LIKE ?",
			searchTerm, searchTerm, searchTerm, searchTerm,
		)
	}

	// Get total count
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve tasks count",
		})
	}

	// Apply pagination
	offset := (page - 1) * limit
	var tasks []model.Task
	if err := query.Preload("Device").Preload("Category").Order(orderClause).Offset(offset).Limit(limit).Find(&tasks).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve tasks",
		})
	}

	populateContactNames(tasks, userID)
	populatePicNames(tasks)

	totalPages := int(math.Ceil(float64(total) / float64(limit)))
	if totalPages == 0 {
		totalPages = 1
	}

	return c.JSON(fiber.Map{
		"data":        tasks,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"total_pages": totalPages,
	})
}

// GetTask handles GET /api/tasks/:id
func GetTask(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	taskUUID := c.Params("uuid")

	if taskUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid task UUID",
		})
	}

	// 1. Resolve active devices for this user to verify ownership
	var deviceIDs []uint64
	if role == "admin" {
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

	var user model.User
	if err := database.DB.Preload("TaskCategories").First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to resolve user task categories",
		})
	}

	var task model.Task
	var queryErr error

	dbQuery := database.DB.Preload("Device").Preload("Category").Preload("TaskMessages", func(db *gorm.DB) *gorm.DB {
		return db.Order("task_messages.created_at ASC")
	}).Preload("TaskLogs", func(db *gorm.DB) *gorm.DB {
		return db.Order("task_logs.created_at DESC")
	}).Preload("TaskLogs.User")

	if len(user.TaskCategories) > 0 {
		var catIDs []uint64
		for _, cat := range user.TaskCategories {
			catIDs = append(catIDs, cat.ID)
		}
		dbQuery = dbQuery.Where("category_id IN ?", catIDs)
	}

	// Support fetching by UUID only now
	queryErr = dbQuery.Where("uuid = ? AND device_id IN ?", taskUUID, deviceIDs).First(&task).Error

	if queryErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Task not found or not owned by user",
		})
	}

	singleTasks := []model.Task{task}
	populateContactNames(singleTasks, userID)
	populatePicNames(singleTasks)
	task = singleTasks[0]

	return c.JSON(task)
}

// UpdateTask handles PUT /api/tasks/:id — updates status and/or category
func UpdateTask(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(uint64)
	role := c.Locals("role").(string)
	// param handled below

	var req UpdateTaskRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Cannot parse request body",
		})
	}

	// Validate status if provided
	req.Status = strings.TrimSpace(req.Status)
	if req.Status != "" {
		validStatus := false
		for _, s := range []string{"Open", "On Progress", "On Hold", "Closed"} {
			if req.Status == s {
				validStatus = true
				break
			}
		}
		if !validStatus {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid status. Must be 'Open', 'On Progress', 'On Hold', or 'Closed'",
			})
		}
	}

	// 1. Resolve active devices for this user
	var deviceIDs []uint64
	if role == "admin" {
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

	var user model.User
	if err := database.DB.Preload("TaskCategories").First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to resolve user task categories",
		})
	}

	var task model.Task
	var queryErr error
	dbQuery := database.DB.Model(&model.Task{})
	if len(user.TaskCategories) > 0 {
		var catIDs []uint64
		for _, cat := range user.TaskCategories {
			catIDs = append(catIDs, cat.ID)
		}
		dbQuery = dbQuery.Where("category_id IN ?", catIDs)
	}

	taskUUID := c.Params("uuid")
	if taskUUID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid task UUID",
		})
	}

	queryErr = dbQuery.Where("uuid = ? AND device_id IN ?", taskUUID, deviceIDs).First(&task).Error

	if queryErr != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Task not found or not owned by user",
		})
	}

	// Validate PIC matches authenticated user if already assigned (admins can bypass, and PIC change request bypasses)
	if role != "admin" && req.PICUserID == nil && task.UpdatedBy != "" && task.UpdatedBy != strconv.FormatUint(userID, 10) {
		picName := "lain"
		if picUID, err := strconv.ParseUint(task.UpdatedBy, 10, 64); err == nil {
			var picUser model.User
			if err := database.DB.First(&picUser, picUID).Error; err == nil {
				picName = picUser.Nickname
				if picName == "" {
					picName = picUser.Name
				}
				if picName == "" {
					picName = picUser.Email
				}
			}
		}
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Task sedang dikerjakan PIC: " + picName,
		})
	}

	// Track if status is changed and record a log
	if req.Status != "" && req.Status != task.Status {
		taskLog := model.TaskLog{
			TaskID:    task.ID,
			OldStatus: task.Status,
			NewStatus: req.Status,
			UserID:    userID,
			CreatedAt: time.Now(),
		}
		if err := database.DB.Create(&taskLog).Error; err != nil {
			log.Printf("Warning: Failed to create TaskLog: %v", err)
		}
		task.Status = req.Status
		if task.UpdatedBy == "" {
			task.UpdatedBy = strconv.FormatUint(userID, 10)
		}
	}

	// Change PIC if requested
	if req.PICUserID != nil {
		picUserIDStr := *req.PICUserID
		var newUpdatedBy string
		if picUserIDStr != "" {
			picUserID, err := strconv.ParseUint(picUserIDStr, 10, 64)
			if err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "Invalid PIC user ID",
				})
			}
			var assignee model.User
			if err := database.DB.First(&assignee, picUserID).Error; err != nil {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"error": "PIC User not found",
				})
			}
			newUpdatedBy = strconv.FormatUint(picUserID, 10)
		}

		if task.UpdatedBy != newUpdatedBy {
			// Resolve old PIC name
			oldPicName := "Unassigned"
			if task.UpdatedBy != "" {
				if oldUID, err := strconv.ParseUint(task.UpdatedBy, 10, 64); err == nil {
					var oldUser model.User
					if err := database.DB.First(&oldUser, oldUID).Error; err == nil {
						oldPicName = oldUser.Nickname
						if oldPicName == "" {
							oldPicName = oldUser.Name
						}
						if oldPicName == "" {
							oldPicName = oldUser.Email
						}
					}
				}
			}

			// Resolve new PIC name
			newPicName := "Unassigned"
			if picUserIDStr != "" {
				picUserID, _ := strconv.ParseUint(picUserIDStr, 10, 64)
				var newUser model.User
				if err := database.DB.First(&newUser, picUserID).Error; err == nil {
					newPicName = newUser.Nickname
					if newPicName == "" {
						newPicName = newUser.Name
					}
					if newPicName == "" {
						newPicName = newUser.Email
					}
				}
			}

			taskLog := model.TaskLog{
				TaskID:    task.ID,
				OldStatus: "PIC: " + oldPicName,
				NewStatus: "PIC: " + newPicName,
				UserID:    userID,
				CreatedAt: time.Now(),
			}
			if err := database.DB.Create(&taskLog).Error; err != nil {
				log.Printf("Warning: Failed to create TaskLog for PIC change: %v", err)
			}

			task.UpdatedBy = newUpdatedBy
		}
	}

	// Resolve category UUID → internal ID if provided
	if req.CategoryUUID != "" {
		var cat model.TaskCategory
		if err := database.DB.Where("uuid = ?", req.CategoryUUID).First(&cat).Error; err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Task category not found",
			})
		}
		// If user is restricted, check if this new category is in their allowed list
		if len(user.TaskCategories) > 0 {
			allowed := false
			for _, userCat := range user.TaskCategories {
				if userCat.ID == cat.ID {
					allowed = true
					break
				}
			}
			if !allowed {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error": "You do not have permission to assign this task category",
				})
			}
		}
		task.CategoryID = &cat.ID
		task.UpdatedBy = strconv.FormatUint(userID, 10)
	}

	if req.Description != nil {
		task.Description = *req.Description
		task.UpdatedBy = strconv.FormatUint(userID, 10)
	}

	task.UpdatedAt = time.Now()

	if err := database.DB.Save(&task).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update task",
		})
	}

	// Reload with category for response
	database.DB.Preload("Category").First(&task, task.ID)
	singleTasks := []model.Task{task}
	populatePicNames(singleTasks)
	task = singleTasks[0]

	return c.JSON(task)
}

func populateContactNames(tasks []model.Task, userID uint64) {
	for i := range tasks {
		parts := strings.Split(tasks[i].Phone, "@")
		phoneDigits := parts[0]
		cleanPhone := ""
		for _, char := range phoneDigits {
			if char >= '0' && char <= '9' {
				cleanPhone += string(char)
			}
		}

		var contactName string
		// Try to match by clean phone
		database.DB.Table("contacts").
			Where("phone = ? AND (device_id IN (SELECT device_id FROM user_devices WHERE user_id = ?) OR device_id IS NULL)", cleanPhone, userID).
			Order("device_id DESC").
			Limit(1).
			Pluck("name", &contactName)

		if contactName != "" {
			tasks[i].ContactName = contactName
		}
	}
}

func populatePicNames(tasks []model.Task) {
	userIDsMap := make(map[uint64]bool)
	for _, t := range tasks {
		if t.UpdatedBy != "" {
			if uid, err := strconv.ParseUint(t.UpdatedBy, 10, 64); err == nil {
				userIDsMap[uid] = true
			}
		}
	}

	if len(userIDsMap) == 0 {
		return
	}

	var uids []uint64
	for uid := range userIDsMap {
		uids = append(uids, uid)
	}

	var users []model.User
	if err := database.DB.Where("id IN ?", uids).Find(&users).Error; err != nil {
		return
	}

	userMap := make(map[uint64]string)
	for _, u := range users {
		name := u.Nickname
		if name == "" {
			name = u.Name
		}
		if name == "" {
			name = u.Email
		}
		userMap[u.ID] = name
	}

	for i := range tasks {
		if tasks[i].UpdatedBy != "" {
			if uid, err := strconv.ParseUint(tasks[i].UpdatedBy, 10, 64); err == nil {
				if name, exists := userMap[uid]; exists {
					tasks[i].PicName = name
				}
			}
		}
	}
}

// ListAssignees handles GET /api/tasks/assignees
func ListAssignees(c *fiber.Ctx) error {
	var users []struct {
		ID       uint64 `json:"id"`
		Name     string `json:"name"`
		Nickname string `json:"nickname"`
		Email    string `json:"email"`
	}
	if err := database.DB.Model(&model.User{}).Order("name ASC").Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to retrieve assignees",
		})
	}
	return c.JSON(users)
}
