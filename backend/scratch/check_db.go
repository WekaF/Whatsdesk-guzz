package main

import (
	"fmt"
	"log"
	"whatapps/backend/configs"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"
)

func main() {
	cfg := configs.LoadConfig()
	db := database.InitDB(cfg)

	var messages []model.Message
	if err := db.Where("media_url LIKE ?", "%7888fca6-7abe-4e88-a2ac-28324b16e9c8%").Or("message LIKE ?", "%7888fca6-7abe-4e88-a2ac-28324b16e9c8%").Find(&messages).Error; err != nil {
		log.Fatalf("Failed to query messages: %v", err)
	}

	fmt.Printf("--- SEARCH RESULTS (Found: %d) ---\n", len(messages))
	for _, msg := range messages {
		fmt.Printf("ID: %d | Type: %s | MediaURL: %q | Msg: %q\n", msg.ID, msg.MessageType, msg.MediaURL, msg.Message)
	}
}
