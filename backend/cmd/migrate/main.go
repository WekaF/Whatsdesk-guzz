package main

import (
	"log"

	"whatapps/backend/configs"
	"whatapps/backend/pkg/database"
	"whatapps/backend/pkg/logger"
)

func main() {
	// Initialize Daily logger for database migrations
	_, closeLog := logger.InitLogger("log", "migrate")
	defer closeLog()

	log.Println("Initiating manual database migrations...")

	// 1. Load configuration
	cfg := configs.LoadConfig()

	// 2. Run Database Initializer (creates db, installs uuid-ossp, runs GORM AutoMigrate, seeds admin user)
	database.InitDB(cfg)

	log.Println("All database tables migrated and seeded successfully!")
}

