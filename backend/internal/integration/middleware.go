package integration

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"strconv"
	"time"

	"whatapps/backend/configs"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"
	rdb "whatapps/backend/pkg/redis"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
)

// APIKeyMiddleware authenticates inbound requests using the X-API-Key or Authorization: Bearer token
func APIKeyMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		var token string

		// 1. Try X-API-Key header
		apiKeyHeader := c.Get("X-API-Key")
		if apiKeyHeader != "" {
			token = apiKeyHeader
		} else {
			// 2. Try Authorization header
			authHeader := c.Get("Authorization")
			if authHeader != "" {
				parts := strings.Split(authHeader, " ")
				if len(parts) == 2 && parts[0] == "Bearer" {
					token = parts[1]
				}
			}
		}

		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing API key in header (X-API-Key or Authorization: Bearer)",
			})
		}

		// 3. Hash token with SHA-256
		hash := sha256.Sum256([]byte(token))
		tokenHash := hex.EncodeToString(hash[:])

		var apiKey model.ApiKey
		cacheKey := "apikey:hash:" + tokenHash
		cacheHit := false

		// 4. Try loading from Redis Cache first
		if rdb.RDB != nil {
			cachedVal, err := rdb.RDB.Get(c.Context(), cacheKey).Result()
			if err == nil && cachedVal != "" {
				if err := json.Unmarshal([]byte(cachedVal), &apiKey); err == nil {
					cacheHit = true
				}
			}
		}

		// 5. Fallback to Database if cache miss
		if !cacheHit {
			err := database.DB.Preload("User").Where("token_hash = ?", tokenHash).First(&apiKey).Error
			if err != nil {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "Invalid API Key",
				})
			}

			// Store in Redis cache for 10 minutes
			if rdb.RDB != nil {
				if apiKeyBytes, err := json.Marshal(apiKey); err == nil {
					rdb.RDB.Set(c.Context(), cacheKey, string(apiKeyBytes), 10*time.Minute)
				}
			}
		}

		// 6. Validate active status
		if !apiKey.IsActive {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "API Key is inactive",
			})
		}

		// 7. Validate expiration date
		if apiKey.ExpiresAt != nil && time.Now().After(*apiKey.ExpiresAt) {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "API Key has expired",
			})
		}

		// 8. Validate IP Whitelisting
		clientIP := c.IP()
		if apiKey.AllowedIPs != "" && apiKey.AllowedIPs != "*" {
			allowed := false
			parts := strings.Split(apiKey.AllowedIPs, ",")
			for _, part := range parts {
				trimmedIP := strings.TrimSpace(part)
				if trimmedIP == clientIP {
					allowed = true
					break
				}
			}
			if !allowed {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
					"error": "IP address not allowed",
				})
			}
		}

		// 9. Update security audit logs in the DB (write-only, do not invalidate cache)
		now := time.Now()
		database.DB.Model(&apiKey).Updates(map[string]interface{}{
			"last_used_at": &now,
			"last_used_ip": clientIP,
		})

		// 10. Inject auth details into locals for downstream handlers
		c.Locals("user_id", apiKey.UserID)
		c.Locals("role", apiKey.User.Role)
		c.Locals("device_id", apiKey.DeviceID)
		c.Locals("api_key_id", apiKey.ID)

		return c.Next()
	}
}

// ApiKeyRateLimiter returns a rate limiting middleware per API Key
func ApiKeyRateLimiter() fiber.Handler {
	cfg := configs.LoadConfig()
	return limiter.New(limiter.Config{
		Max:        cfg.ApiRateLimitMax,
		Expiration: time.Duration(cfg.ApiRateLimitExpSeconds) * time.Second,
		KeyGenerator: func(c *fiber.Ctx) string {
			if val := c.Locals("api_key_id"); val != nil {
				if id, ok := val.(uint64); ok {
					return "api_key_limit:" + strconv.FormatUint(id, 10)
				}
			}
			return "ip_limit:" + c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Too many requests. Rate limit exceeded.",
			})
		},
	})
}
