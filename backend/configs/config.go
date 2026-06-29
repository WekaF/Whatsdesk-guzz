package configs

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	ServerPort       string
	DBHost           string
	DBPort           string
	DBUser           string
	DBPassword       string
	DBName           string
	RedisHost        string
	RedisPort        string
	RedisPassword    string
	RedisDB          int
	JWTSecret        string
	UploadDir        string
	TelegramBotToken string
	TelegramChatID   string
}

func LoadConfig() *Config {
	envMap, err := godotenv.Read()
	if err != nil {
		log.Println("Note: .env file not found or failed to read, using system environment variables")
		envMap = make(map[string]string)
	}

	getEnvVal := func(key, fallback string) string {
		if val, exists := envMap[key]; exists {
			return val
		}
		if val, exists := os.LookupEnv(key); exists {
			return val
		}
		return fallback
	}

	redisDBStr := getEnvVal("REDIS_DB", "0")
	redisDB, err := strconv.Atoi(redisDBStr)
	if err != nil {
		redisDB = 0
	}

	return &Config{
		ServerPort:       getEnvVal("SERVER_PORT", "8000"),
		DBHost:           getEnvVal("DB_HOST", "localhost"),
		DBPort:           getEnvVal("DB_PORT", "5432"),
		DBUser:           getEnvVal("DB_USER", "whatapps"),
		DBPassword:       getEnvVal("DB_PASSWORD", "whatappspassword"),
		DBName:           getEnvVal("DB_NAME", "whatapps_db"),
		RedisHost:        getEnvVal("REDIS_HOST", "localhost"),
		RedisPort:        getEnvVal("REDIS_PORT", "6379"),
		RedisPassword:    getEnvVal("REDIS_PASSWORD", ""),
		RedisDB:          redisDB,
		JWTSecret:        getEnvVal("JWT_SECRET", "super-secret-key-whatsapp-gateway"),
		UploadDir:        getEnvVal("UPLOAD_DIR", "./uploads"),
		TelegramBotToken: getEnvVal("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:   getEnvVal("TELEGRAM_CHAT_ID", ""),
	}
}
