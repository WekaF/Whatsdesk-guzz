package stats

import (
	"context"
	"log"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"
	rdb "whatapps/backend/pkg/redis"

	"github.com/gofiber/fiber/v2"
)

type QueueStats struct {
	// Redis Stream info
	StreamLength   int64 `json:"stream_length"`    // XLEN: total entries ever added
	PendingInQueue int64 `json:"pending_in_queue"` // PEL count: taken by worker, not ACK'd
	ConsumerCount  int64 `json:"consumer_count"`   // Active consumers in the group

	// Database message counts
	DBPending   int64 `json:"db_pending"`   // Messages with status PENDING
	DBSent      int64 `json:"db_sent"`      // Messages with status SENT
	DBDelivered int64 `json:"db_delivered"` // Messages with status DELIVERED
	DBFailed    int64 `json:"db_failed"`    // Messages with status FAILED
	DBTotal     int64 `json:"db_total"`     // Total messages in DB

	// Health
	RedisConnected bool `json:"redis_connected"`
}

func GetQueueStats(c *fiber.Ctx) error {
	ctx := context.Background()
	stats := QueueStats{}

	// --- Redis Stats ---
	if rdb.RDB != nil {
		stats.RedisConnected = true

		// XLEN: total entries in the stream (ever enqueued)
		xlen, err := rdb.RDB.XLen(ctx, rdb.MessageQueueStream).Result()
		if err != nil {
			log.Printf("[Stats] XLEN error: %v", err)
		} else {
			stats.StreamLength = xlen
		}

		// XPENDING: messages delivered to consumer but not yet ACK'd (in-flight)
		pending, err := rdb.RDB.XPending(ctx, rdb.MessageQueueStream, rdb.MessageQueueGroup).Result()
		if err != nil {
			log.Printf("[Stats] XPENDING error: %v", err)
		} else {
			stats.PendingInQueue = pending.Count
		}

		// XINFO GROUPS: number of active consumers
		groups, err := rdb.RDB.XInfoGroups(ctx, rdb.MessageQueueStream).Result()
		if err != nil {
			log.Printf("[Stats] XINFO GROUPS error: %v", err)
		} else {
			for _, g := range groups {
				if g.Name == rdb.MessageQueueGroup {
					stats.ConsumerCount = int64(g.Consumers)
					break
				}
			}
		}
	}

	// --- Database Message Counts ---
	type StatusCount struct {
		Status string
		Count  int64
	}

	var results []StatusCount
	database.DB.Model(&model.Message{}).
		Select("status, COUNT(*) as count").
		Group("status").
		Scan(&results)

	var total int64
	for _, r := range results {
		total += r.Count
		switch r.Status {
		case "PENDING":
			stats.DBPending = r.Count
		case "SENT":
			stats.DBSent = r.Count
		case "DELIVERED":
			stats.DBDelivered = r.Count
		case "FAILED":
			stats.DBFailed = r.Count
		}
	}
	stats.DBTotal = total

	return c.JSON(stats)
}

type CategoryTaskStats struct {
	CategoryID   uint64 `json:"category_id"`
	CategoryName string `json:"category_name"`
	Color        string `json:"color"`
	Total        int64  `json:"total"`
	Open         int64  `json:"open"`
	InProgress   int64  `json:"in_progress"`
	OnHold       int64  `json:"on_hold"`
	Closed       int64  `json:"closed"`
}

type TaskStats struct {
	Total      int64                `json:"total"`
	Open       int64                `json:"open"`
	InProgress int64                `json:"in_progress"`
	Resolved   int64                `json:"resolved"`
	OnHold     int64                `json:"on_hold"`
	Closed     int64                `json:"closed"`
	Categories []CategoryTaskStats  `json:"categories"`
}

func GetTaskStats(c *fiber.Ctx) error {
	stats := TaskStats{
		Categories: []CategoryTaskStats{},
	}

	startDate := c.Query("start_date")
	endDate := c.Query("end_date")

	type StatusCount struct {
		Status string
		Count  int64
	}

	// 1. Fetch overall status statistics
	var results []StatusCount
	q1 := database.DB.Model(&model.Task{})
	if startDate != "" {
		q1 = q1.Where("created_at >= ?", startDate)
	}
	if endDate != "" {
		if len(endDate) == 10 {
			q1 = q1.Where("created_at <= ?", endDate+" 23:59:59")
		} else {
			q1 = q1.Where("created_at <= ?", endDate)
		}
	}

	if err := q1.Select("status, COUNT(*) as count").
		Group("status").
		Scan(&results).Error; err != nil {
		log.Printf("[Stats] Failed to fetch task stats: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch task statistics",
		})
	}

	for _, r := range results {
		stats.Total += r.Count
		switch r.Status {
		case "Open":
			stats.Open = r.Count
		case "On Progress", "IN_PROGRESS":
			stats.InProgress = r.Count
		case "On Hold":
			stats.OnHold = r.Count
		case "Closed", "RESOLVED":
			stats.Closed = r.Count
		}
	}

	// 2. Fetch category-wise status statistics
	type CategoryStatusCount struct {
		CategoryID   *uint64
		CategoryName *string
		Color        *string
		Status       string
		Count        int64
	}

	var catResults []CategoryStatusCount
	q2 := database.DB.Model(&model.Task{})
	if startDate != "" {
		q2 = q2.Where("tasks.created_at >= ?", startDate)
	}
	if endDate != "" {
		if len(endDate) == 10 {
			q2 = q2.Where("tasks.created_at <= ?", endDate+" 23:59:59")
		} else {
			q2 = q2.Where("tasks.created_at <= ?", endDate)
		}
	}

	if err := q2.Select("tasks.category_id, task_categories.name as category_name, task_categories.color, tasks.status, COUNT(*) as count").
		Joins("LEFT JOIN task_categories ON task_categories.id = tasks.category_id").
		Group("tasks.category_id, task_categories.name, task_categories.color, tasks.status").
		Scan(&catResults).Error; err != nil {
		log.Printf("[Stats] Failed to fetch task stats by category: %v", err)
	}

	catStatsMap := make(map[uint64]*CategoryTaskStats)
	var uncategorizedStats *CategoryTaskStats

	for _, r := range catResults {
		if r.CategoryID == nil {
			if uncategorizedStats == nil {
				uncategorizedStats = &CategoryTaskStats{
					CategoryName: "Uncategorized",
					Color:        "#94a3b8",
				}
			}
			uncategorizedStats.Total += r.Count
			switch r.Status {
			case "Open":
				uncategorizedStats.Open = r.Count
			case "On Progress", "IN_PROGRESS":
				uncategorizedStats.InProgress = r.Count
			case "On Hold":
				uncategorizedStats.OnHold = r.Count
			case "Closed", "RESOLVED":
				uncategorizedStats.Closed = r.Count
			}
		} else {
			catID := *r.CategoryID
			s, exists := catStatsMap[catID]
			if !exists {
				name := "Category"
				if r.CategoryName != nil {
					name = *r.CategoryName
				}
				color := "#6366f1"
				if r.Color != nil {
					color = *r.Color
				}
				s = &CategoryTaskStats{
					CategoryID:   catID,
					CategoryName: name,
					Color:        color,
				}
				catStatsMap[catID] = s
			}
			s.Total += r.Count
			switch r.Status {
			case "Open":
				s.Open = r.Count
			case "On Progress", "IN_PROGRESS":
				s.InProgress = r.Count
			case "On Hold":
				s.OnHold = r.Count
			case "Closed", "RESOLVED":
				s.Closed = r.Count
			}
		}
	}

	for _, s := range catStatsMap {
		stats.Categories = append(stats.Categories, *s)
	}
	if uncategorizedStats != nil {
		stats.Categories = append(stats.Categories, *uncategorizedStats)
	}

	return c.JSON(stats)
}
