package main

import (
	"fmt"
	"log"

	"whatapps/backend/configs"
	"whatapps/backend/internal/model"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	cfg := configs.LoadConfig()
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Jakarta",
		cfg.DBHost, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBPort)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	fmt.Println("--- AUTO REPLIES ---")
	var rules []model.AutoReply
	db.Find(&rules)
	for _, r := range rules {
		fmt.Printf("ID: %d, DeviceID: %d, Keyword: '%s', MatchType: %s, ReplyMessage: '%s', IsActive: %v\n",
			r.ID, r.DeviceID, r.Keyword, r.MatchType, r.ReplyMessage, r.IsActive)
	}

	fmt.Println("\n--- RECENT MESSAGES ---")
	var messages []model.Message
	db.Order("created_at desc").Limit(10).Find(&messages)
	for _, m := range messages {
		fmt.Printf("ID: %d, DeviceID: %d, Direction: %s, Phone: %s, Message: '%s', Status: %s, CreatedAt: %s\n",
			m.ID, m.DeviceID, m.Direction, m.Phone, m.Message, m.Status, m.CreatedAt.Format("15:04:05"))
	}
}
