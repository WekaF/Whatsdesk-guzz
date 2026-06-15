package database

import (
	"fmt"
	"log"
	"strings"
	"whatapps/backend/configs"
	"whatapps/backend/internal/model"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDB(cfg *configs.Config) *gorm.DB {
	// Create database if it does not exist on the server
	createDatabaseIfNotExists(cfg)

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Jakarta",
		cfg.DBHost, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBPort)

	log.Printf("Connecting to database using DSN: host=%s user=%s dbname=%s port=%s",
		cfg.DBHost, cfg.DBUser, cfg.DBName, cfg.DBPort)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	log.Println("Database connection established successfully")

	// Ensure uuid-ossp extension is enabled
	err = db.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).Error
	if err != nil {
		log.Fatalf("Failed to enable 'uuid-ossp' extension: %v", err)
	}

	// Create PL/pgSQL function generate_task_number if not exists
	err = db.Exec(`
		CREATE OR REPLACE FUNCTION generate_task_number()
		RETURNS VARCHAR AS $$
		DECLARE
			new_number VARCHAR;
			chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
			digits TEXT := '0123456789';
			c1 CHAR;
			d1 CHAR;
			c2 CHAR;
			d2 CHAR;
			done BOOLEAN := FALSE;
		BEGIN
			WHILE NOT done LOOP
				c1 := substr(chars, floor(random() * 26)::int + 1, 1);
				d1 := substr(digits, floor(random() * 10)::int + 1, 1);
				c2 := substr(chars, floor(random() * 26)::int + 1, 1);
				d2 := substr(digits, floor(random() * 10)::int + 1, 1);
				
				new_number := 'LEAD-' || c1 || d1 || c2 || d2;
				
				BEGIN
					EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE number = $1)', 'tasks')
					USING new_number
					INTO done;
					done := NOT done;
				EXCEPTION WHEN OTHERS THEN
					done := TRUE;
				END;
			END LOOP;
			RETURN new_number;
		END;
		$$ LANGUAGE plpgsql;
	`).Error
	if err != nil {
		log.Fatalf("Failed to create 'generate_task_number' function: %v", err)
	}

	// Drop old single-column unique index idx_user_phone on contacts if it exists and is only on phone
	var indexDef string
	db.Raw("SELECT indexdef FROM pg_indexes WHERE tablename = 'contacts' AND indexname = 'idx_user_phone'").Scan(&indexDef)
	if indexDef != "" && !strings.Contains(indexDef, "user_id") {
		log.Println("Dropping old single-column idx_user_phone index on contacts...")
		if err := db.Exec("DROP INDEX IF EXISTS idx_user_phone").Error; err != nil {
			log.Printf("Warning: Failed to drop old idx_user_phone index: %v", err)
		}
	}

	// Auto-migrate tables
	err = db.AutoMigrate(
		&model.Role{},
		&model.Menu{},
		&model.RoleMenuPermission{},
		&model.User{},
		&model.UserDevice{},
		&model.Device{},
		&model.Message{},
		&model.Broadcast{},
		&model.BroadcastDetail{},
		&model.Contact{},
		&model.TaskCategory{}, // must come before AutoReply and Task (FK deps)
		&model.UserTaskCategory{},
		&model.AutoReply{},
		&model.Task{},
		&model.TaskMessage{},
		&model.TaskLog{},
	)
	if err != nil {
		log.Fatalf("Failed to run database migrations: %v", err)
	}

	// Backfill existing tasks with null or empty numbers
	var checkTasksCount int64
	db.Model(&model.Task{}).Where("number IS NULL OR number = ''").Count(&checkTasksCount)
	if checkTasksCount > 0 {
		log.Printf("Backfilling %d tasks with generated numbers...", checkTasksCount)
		if err := db.Exec(`UPDATE tasks SET number = generate_task_number() WHERE number IS NULL OR number = ''`).Error; err != nil {
			log.Printf("Warning: Failed to backfill task numbers: %v", err)
		} else {
			log.Println("Task numbers backfilled successfully.")
		}
	}

	// Ensure tasks.number column is NOT NULL
	if err := db.Exec(`ALTER TABLE tasks ALTER COLUMN number SET NOT NULL`).Error; err != nil {
		log.Printf("Warning: Failed to set tasks.number to NOT NULL: %v", err)
	}

	// Migrate old device assignments to join table if user_id column still exists in devices
	var hasUserID bool
	db.Raw("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='devices' AND column_name='user_id')").Scan(&hasUserID)
	if hasUserID {
		log.Println("Migrating device user_id assignments to user_devices join table...")
		if err := db.Exec("INSERT INTO user_devices (user_id, device_id) SELECT user_id, id FROM devices WHERE user_id IS NOT NULL ON CONFLICT DO NOTHING").Error; err != nil {
			log.Printf("Warning: Failed to copy old device assignments: %v", err)
		}
		if err := db.Exec("ALTER TABLE devices DROP COLUMN IF EXISTS user_id").Error; err != nil {
			log.Printf("Warning: Failed to drop user_id column from devices: %v", err)
		}
	}

	log.Println("Database migration completed successfully")

	// Seed roles, menus, and permissions
	seedRolesMenusAndPermissions(db)

	// Seed default admin user if database is empty
	seedAdminUser(db)

	DB = db
	return db
}

func createDatabaseIfNotExists(cfg *configs.Config) {
	// Connect to default "postgres" database first
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=postgres port=%s sslmode=disable TimeZone=Asia/Jakarta",
		cfg.DBHost, cfg.DBUser, cfg.DBPassword, cfg.DBPort)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Printf("Note: Failed to connect to default 'postgres' database to check database existence: %v", err)
		return
	}

	var count int
	err = db.Raw("SELECT count(*) FROM pg_database WHERE datname = ?", cfg.DBName).Scan(&count).Error
	if err != nil {
		log.Printf("Warning: Failed to query pg_database: %v", err)
		return
	}

	if count == 0 {
		log.Printf("Database '%s' does not exist. Creating database on server...", cfg.DBName)
		sqlDB, err := db.DB()
		if err != nil {
			log.Printf("Warning: Failed to retrieve raw sql.DB: %v", err)
			return
		}
		_, err = sqlDB.Exec(fmt.Sprintf("CREATE DATABASE %s", cfg.DBName))
		if err != nil {
			log.Printf("Warning: Failed to execute CREATE DATABASE: %v", err)
			return
		}
		log.Printf("Database '%s' created successfully!", cfg.DBName)
	}

	sqlDB, _ := db.DB()
	if sqlDB != nil {
		sqlDB.Close()
	}
}

func seedAdminUser(db *gorm.DB) {
	var count int64
	db.Model(&model.User{}).Count(&count)
	if count == 0 {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte("adminpassword"), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("Failed to hash seed password: %v", err)
			return
		}
		admin := model.User{
			Name:     "Admin User",
			Email:    "admin@whatapps.com",
			Password: string(hashedPassword),
			Role:     "admin",
		}
		if err := db.Create(&admin).Error; err != nil {
			log.Printf("Failed to seed admin user: %v", err)
		} else {
			log.Println("Database seeded with default admin user: admin@whatapps.com / adminpassword")
		}
	}
}

func seedRolesMenusAndPermissions(db *gorm.DB) {
	// 1. Seed Roles
	var rolesCount int64
	db.Model(&model.Role{}).Count(&rolesCount)
	if rolesCount == 0 {
		roles := []model.Role{
			{Name: "admin", Description: "Administrator with full system control"},
			{Name: "user", Description: "Standard user with access to messaging features"},
		}
		for _, r := range roles {
			if err := db.Create(&r).Error; err != nil {
				log.Printf("Failed to seed role %s: %v", r.Name, err)
			}
		}
		log.Println("Roles table seeded successfully")
	}

	// 2. Seed Menus
	defaultMenus := []model.Menu{
		{Name: "Dashboard", Key: "dashboard", Path: "/dashboard", Icon: "layout-dashboard", SortOrder: 1},
		{Name: "Devices", Key: "devices", Path: "/devices", Icon: "tablet-smartphone", SortOrder: 2},
		{Name: "Messages", Key: "messages", Path: "/messages", Icon: "message-square", SortOrder: 3},
		{Name: "Contacts", Key: "contacts", Path: "/contacts", Icon: "book-open", SortOrder: 4},
		{Name: "Auto Replies", Key: "auto-replies", Path: "/auto-replies", Icon: "reply", SortOrder: 5},
		{Name: "Tasks", Key: "tasks", Path: "/tasks", Icon: "clipboard-list", SortOrder: 6},
		{Name: "Task Categories", Key: "task-categories", Path: "/task-categories", Icon: "tag", SortOrder: 7},
		{Name: "User Management", Key: "users", Path: "/users", Icon: "users", SortOrder: 8},
		{Name: "Role Management", Key: "roles", Path: "/roles", Icon: "shield-check", SortOrder: 9},
		{Name: "Task List", Key: "task-list", Path: "/task-list", Icon: "list-todo", SortOrder: 10},
	}

	for _, dm := range defaultMenus {
		var count int64
		db.Model(&model.Menu{}).Where("key = ?", dm.Key).Count(&count)
		if count == 0 {
			if err := db.Create(&dm).Error; err != nil {
				log.Printf("Failed to seed menu %s: %v", dm.Name, err)
			} else {
				log.Printf("Seeded menu %s successfully", dm.Name)
			}
		} else {
			db.Model(&model.Menu{}).Where("key = ?", dm.Key).Updates(map[string]interface{}{
				"sort_order": dm.SortOrder,
				"name":       dm.Name,
				"path":       dm.Path,
				"icon":       dm.Icon,
			})
		}
	}
	log.Println("Menus table dynamic seeding completed")

	// 3. Seed Permissions
	var adminRole, userRole model.Role
	db.Where("name = ?", "admin").First(&adminRole)
	db.Where("name = ?", "user").First(&userRole)

	var menus []model.Menu
	db.Find(&menus)

	for _, m := range menus {
		// Admin gets full CRUD access
		var adminPermCount int64
		db.Model(&model.RoleMenuPermission{}).Where("role_id = ? AND menu_id = ?", adminRole.ID, m.ID).Count(&adminPermCount)
		if adminPermCount == 0 {
			adminPerm := model.RoleMenuPermission{
				RoleID:    adminRole.ID,
				MenuID:    m.ID,
				CanCreate: true,
				CanRead:   true,
				CanUpdate: true,
				CanDelete: true,
			}
			db.Create(&adminPerm)
		}

		// User gets full access (except for users and roles)
		if m.Key != "users" && m.Key != "roles" {
			var userPermCount int64
			db.Model(&model.RoleMenuPermission{}).Where("role_id = ? AND menu_id = ?", userRole.ID, m.ID).Count(&userPermCount)
			if userPermCount == 0 {
				userPerm := model.RoleMenuPermission{
					RoleID:    userRole.ID,
					MenuID:    m.ID,
					CanCreate: true,
					CanRead:   true,
					CanUpdate: true,
					CanDelete: true,
				}
				db.Create(&userPerm)
			}
		}
	}
	log.Println("RoleMenuPermissions dynamic seeding completed")
}

func ResolveRealPhone(incomingJID string) string {
	parts := strings.Split(incomingJID, "@")
	userPart := parts[0]

	var mappedPN string
	// Check if there is a mapping in whatsmeow_lid_map using bare user parts
	err := DB.Table("whatsmeow_lid_map").
		Where("lid = ? OR pn = ?", userPart, userPart).
		Pluck("pn", &mappedPN).Error

	realUserPart := userPart
	if err == nil && mappedPN != "" {
		realUserPart = mappedPN
	}

	// Extract digits from the resolved user part
	clean := ""
	for _, char := range realUserPart {
		if char >= '0' && char <= '9' {
			clean += string(char)
		}
	}
	return clean
}

