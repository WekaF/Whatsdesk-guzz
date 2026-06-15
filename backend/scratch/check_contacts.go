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

	fmt.Println("--- Tables in Database ---")
	var tables []string
	db.Raw("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").Scan(&tables)
	for _, t := range tables {
		fmt.Println("-", t)
	}

	fmt.Println("\n--- Columns in whatsmeow_lid_map ---")
	type ColInfo struct {
		ColumnName string `gorm:"column:column_name"`
		DataType   string `gorm:"column:data_type"`
	}
	var columns []ColInfo
	db.Raw("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'whatsmeow_lid_map'").Scan(&columns)
	for _, c := range columns {
		fmt.Printf("Column: %s (%s)\n", c.ColumnName, c.DataType)
	}
}
