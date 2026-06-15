package main

import (
	"fmt"
	"log"
	"whatapps/backend/configs"

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

	type LidMap struct {
		Lid string `gorm:"column:lid"`
		Pn  string `gorm:"column:pn"`
	}

	var results []LidMap
	db.Table("whatsmeow_lid_map").
		Where("lid LIKE ? OR pn LIKE ?", "%134552920002580%", "%134552920002580%").
		Find(&results)

	fmt.Printf("Found %d results:\n", len(results))
	for _, r := range results {
		fmt.Printf("LID: %s | PN: %s\n", r.Lid, r.Pn)
	}
}
