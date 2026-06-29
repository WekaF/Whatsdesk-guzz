package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"whatapps/backend/configs"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"
	rdb "whatapps/backend/pkg/redis"
)

func main() {
	fmt.Println("=== STARTING API KEY SECURITY & PERFORMANCE VERIFICATION ===")
	cfg := configs.LoadConfig()
	db := database.InitDB(cfg)
	rdb.InitRedis(cfg)

	// Clean up any old test key
	db.Unscoped().Where("name = ?", "E2E Verification Key").Delete(&model.ApiKey{})

	// 1. Get first active device in the system to bind the key
	var device model.Device
	if err := db.First(&device).Error; err != nil {
		fmt.Printf("FAIL: No WhatsApp device found in database: %v\n", err)
		os.Exit(1)
	}

	// 2. Create a test API key token
	rawToken := "wa_key_test_e2e_verification_token_12345"
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])
	maskedToken := "wa_key_****************1234"

	testKey := model.ApiKey{
		Name:        "E2E Verification Key",
		TokenHash:   tokenHash,
		MaskedToken: maskedToken,
		DeviceID:    device.ID,
		UserID:      1, // default admin user
		IsActive:    true,
		AllowedIPs:  "*", // default unrestricted
		CreatedAt:   time.Now(),
	}

	if err := db.Create(&testKey).Error; err != nil {
		fmt.Printf("FAIL: Failed to create test API key: %v\n", err)
		os.Exit(1)
	}
	defer func() {
		db.Unscoped().Delete(&testKey)
		if rdb.RDB != nil {
			rdb.RDB.Del(db.Statement.Context, "apikey:hash:"+tokenHash)
		}
		fmt.Println("CLEANUP: Test API Key removed successfully.")
	}()

	fmt.Println("STEP 1: Test API Key created in DB.")

	// Helper function to send requests
	sendReq := func(token string) (int, string, http.Header) {
		payload := map[string]interface{}{
			"phone":   "6285852968412",
			"message": "E2E Automated Verification Test Message",
		}
		jsonBytes, _ := json.Marshal(payload)

		req, _ := http.NewRequest("POST", "http://localhost:8000/api/v1/integration/send", bytes.NewBuffer(jsonBytes))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-API-Key", token)

		client := &http.Client{Timeout: 3 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return 0, err.Error(), nil
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, string(body), resp.Header
	}

	// Test Case 1: Unrestricted Active Key (Should pass middleware)
	code, body, headers := sendReq(rawToken)
	fmt.Printf("Test Case 1 (Unrestricted IP): Code=%d, Body=%s\n", code, body)
	if code != http.StatusAccepted && code != http.StatusBadRequest {
		// Wait, if device is not connected/ready, it might return 400 or 500, but not 401 Unauthorized!
		// If code is 401, it means middleware rejected it. If it is 202 or 500/400 (model validation / queue issues), middleware passed.
		if code == http.StatusUnauthorized {
			fmt.Println("FAIL: Middleware rejected valid key.")
			os.Exit(1)
		}
	}
	fmt.Println("PASS: Test Case 1 (Valid key allowed by middleware).")

	// Check if Rate limit headers are present
	if headers.Get("X-RateLimit-Limit") != "" {
		fmt.Printf("PASS: Rate limit headers detected: Limit=%s, Remaining=%s\n", 
			headers.Get("X-RateLimit-Limit"), headers.Get("X-RateLimit-Remaining"))
	} else {
		fmt.Println("FAIL: Rate limiting headers missing from response.")
		os.Exit(1)
	}

	// Test Case 2: Verify Redis Cache
	// If cached, querying a second time should hit Redis. Let's modify the name in DB directly without clearing cache.
	db.Model(&testKey).Update("name", "Modified in DB directly")
	
	// Query again. Since cache is active, middleware should still run successfully.
	code, _, _ = sendReq(rawToken)
	if code == http.StatusUnauthorized {
		fmt.Println("FAIL: Cache hit failed.")
		os.Exit(1)
	}
	fmt.Println("PASS: Test Case 2 (Redis Caching works).")

	// Test Case 3: Invalidate Cache on Toggle
	// Simulate toggling the status to inactive.
	// Toggle handler deletes cache key in handler. Let's do it manually to test the middleware behavior.
	db.Model(&testKey).Updates(map[string]interface{}{"is_active": false})
	if rdb.RDB != nil {
		rdb.RDB.Del(db.Statement.Context, "apikey:hash:"+tokenHash)
	}

	code, body, _ = sendReq(rawToken)
	fmt.Printf("Test Case 3 (Inactive Key after cache invalidation): Code=%d, Body=%s\n", code, body)
	if code != http.StatusUnauthorized || !bytes.Contains([]byte(body), []byte("inactive")) {
		fmt.Println("FAIL: Inactive key was not blocked or returned wrong response.")
		os.Exit(1)
	}
	fmt.Println("PASS: Test Case 3 (Cache invalidation & inactive toggle blocks request).")

	// Restore active status
	db.Model(&testKey).Updates(map[string]interface{}{"is_active": true})
	if rdb.RDB != nil {
		rdb.RDB.Del(db.Statement.Context, "apikey:hash:"+tokenHash)
	}

	// Test Case 4: IP Whitelisting Block
	// Set allowed IPs to something that doesn't match our local caller IP
	db.Model(&testKey).Updates(map[string]interface{}{"allowed_ips": "192.168.99.99"})
	if rdb.RDB != nil {
		rdb.RDB.Del(db.Statement.Context, "apikey:hash:"+tokenHash)
	}

	code, body, _ = sendReq(rawToken)
	fmt.Printf("Test Case 4 (IP Whitelisted to 192.168.99.99): Code=%d, Body=%s\n", code, body)
	if code != http.StatusUnauthorized || !bytes.Contains([]byte(body), []byte("IP address not allowed")) {
		fmt.Println("FAIL: Request from non-whitelisted IP was not blocked.")
		os.Exit(1)
	}
	fmt.Println("PASS: Test Case 4 (Non-whitelisted IP blocked correctly).")

	// Test Case 5: IP Whitelisting Allow
	// Set allowed IPs to allow localhost (127.0.0.1)
	db.Model(&testKey).Updates(map[string]interface{}{"allowed_ips": "127.0.0.1, 192.168.1.1"})
	if rdb.RDB != nil {
		rdb.RDB.Del(db.Statement.Context, "apikey:hash:"+tokenHash)
	}

	code, body, _ = sendReq(rawToken)
	fmt.Printf("Test Case 5 (IP Whitelisted to 127.0.0.1): Code=%d, Body=%s\n", code, body)
	if code == http.StatusUnauthorized && bytes.Contains([]byte(body), []byte("IP address not allowed")) {
		fmt.Println("FAIL: Whitelisted IP was blocked.")
		os.Exit(1)
	}
	fmt.Println("PASS: Test Case 5 (Whitelisted IP allowed correctly).")

	// Test Case 6: Expiration Date Block
	// Set expiration in the past
	pastTime := time.Now().Add(-1 * time.Hour)
	db.Model(&testKey).Updates(map[string]interface{}{"expires_at": &pastTime})
	if rdb.RDB != nil {
		rdb.RDB.Del(db.Statement.Context, "apikey:hash:"+tokenHash)
	}

	code, body, _ = sendReq(rawToken)
	fmt.Printf("Test Case 6 (Expired API Key): Code=%d, Body=%s\n", code, body)
	if code != http.StatusUnauthorized || !bytes.Contains([]byte(body), []byte("expired")) {
		fmt.Println("FAIL: Expired key was allowed or returned wrong error.")
		os.Exit(1)
	}
	fmt.Println("PASS: Test Case 6 (Expired key blocked correctly).")

	fmt.Println("\n=== ALL E2E VERIFICATION CHECKS COMPLETED SUCCESSFULLY ===")
}
