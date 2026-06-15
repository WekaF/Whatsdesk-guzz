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

	var tasks []model.Task
	if err := db.Find(&tasks).Error; err != nil {
		log.Fatalf("Failed to query tasks: %v", err)
	}

	fmt.Printf("Total Tasks: %d\n", len(tasks))
	for _, t := range tasks {
		fmt.Printf("ID: %d | DeviceID: %d | Phone: %s | TriggerMsg: %s | Status: %s | CreatedAt: %s\n",
			t.ID, t.DeviceID, t.Phone, t.TriggerMsg, t.Status, t.CreatedAt)
	}
}
