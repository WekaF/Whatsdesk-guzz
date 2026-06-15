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

	fmt.Println("--- USERS ---")
	var users []model.User
	db.Find(&users)
	for _, u := range users {
		fmt.Printf("ID: %d, Name: %s, Email: %s, Role: %s\n", u.ID, u.Name, u.Email, u.Role)
	}

	fmt.Println("\n--- DEVICES ---")
	var devices []model.Device
	db.Find(&devices)
	for _, d := range devices {
		uidStr := "nil"
		if d.UserID != nil {
			uidStr = fmt.Sprintf("%d", *d.UserID)
		}
		fmt.Printf("ID: %d, UserID: %s, Name: %s, Status: %s, Phone: %s\n", d.ID, uidStr, d.DeviceName, d.Status, d.Phone)
	}

	fmt.Println("\n--- AUTO REPLIES ---")
	var replies []model.AutoReply
	db.Find(&replies)
	for _, r := range replies {
		fmt.Printf("ID: %d, DeviceID: %d, Keyword: %s, MatchType: %s, Message: %s, Active: %t\n", r.ID, r.DeviceID, r.Keyword, r.MatchType, r.ReplyMessage, r.IsActive)
	}
}
