package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"whatapps/backend/configs"
	"whatapps/backend/internal/router"
	"whatapps/backend/internal/whatsapp"
	"whatapps/backend/internal/worker"
	"whatapps/backend/pkg/database"
	"whatapps/backend/pkg/logger"
	"whatapps/backend/pkg/redis"

	"github.com/gofiber/fiber/v2"
	fiberLogger "github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
	// 0. Initialize Logger (daily rotating txt file in 'log' folder)
	_, closeLog := logger.InitLogger("log", "app")
	defer closeLog()

	log.Println("Starting WhatsApp Gateway server...")

	// 1. Load configuration
	cfg := configs.LoadConfig()

	// 2. Initialize PostgreSQL Connection
	gormDB := database.InitDB(cfg)

	// 3. Get raw sql DB connection to pass to whatsmeow sqlstore
	sqlDB, err := gormDB.DB()
	if err != nil {
		log.Fatalf("Failed to retrieve raw SQL DB connection: %v", err)
	}

	// Limit connection pool to 1 to prevent concurrent catalog lock issues on Windows/PostgreSQL
	sqlDB.SetMaxOpenConns(1)

	// 4. Initialize Whatsmeow manager
	whatsappManager := whatsapp.InitManager(cfg, sqlDB)

	// Restore connection pool settings for runtime concurrency
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(5)

	// 5. Connect all saved active devices from database
	whatsappManager.StartAllDevices()

	// 6. Initialize Redis Connection
	rdbClient := redis.InitRedis(cfg)

	// 7. Start Queue Worker
	queueWorker := worker.NewQueueWorker(rdbClient)
	queueWorker.Start()

	// 8. Bootstrap Fiber Web App
	app := fiber.New(fiber.Config{
		DisableStartupMessage: false,
		ReadTimeout:           10 * time.Second,
		WriteTimeout:          10 * time.Second,
	})

	// Add standard request logger middleware to write to standard output and log file
	app.Use(fiberLogger.New(fiberLogger.Config{
		Format: "[${time}] ${status} - ${latency} ${method} ${path}\n",
		Output: logger.MultiWriter,
	}))

	router.SetupRoutes(app)

	// Start server in a separate goroutine
	go func() {
		port := ":" + cfg.ServerPort
		log.Printf("Server listening on port %s", port)
		if err := app.Listen(port); err != nil {
			log.Fatalf("Server failed to run: %v", err)
		}
	}()

	// Wait for termination signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// 9. Stop queue worker
	queueWorker.Stop()

	// 10. Close Redis connection
	if err := rdbClient.Close(); err != nil {
		log.Printf("Error closing Redis: %v", err)
	}

	// 11. Shutdown Fiber App
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil {
		log.Printf("Error during server shutdown: %v", err)
	}

	log.Println("Server gracefully stopped")
}

