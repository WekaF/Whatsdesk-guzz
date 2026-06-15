package main

import (
	"fmt"
	"log"
	"whatapps/backend/configs"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type LidMap struct {
	Lid string `gorm:"column:lid"`
	Pn  string `gorm:"column:pn"`
}

func main() {
	cfg := configs.LoadConfig()
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Jakarta",
		cfg.DBHost, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBPort)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	var maps []LidMap
	if err := db.Table("whatsmeow_lid_map").Find(&maps).Error; err != nil {
		log.Fatalf("Failed to query whatsmeow_lid_map: %v", err)
	}

	fmt.Printf("Total mappings: %d\n", len(maps))
	for _, m := range maps {
		fmt.Printf("LID: %s | PN: %s\n", m.Lid, m.Pn)
	}
}
