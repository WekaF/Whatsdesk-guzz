# WA Auto-Reconnect Telegram Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a WhatsApp device disconnects or gets logged out, automatically send the QR code image to admin via Telegram so they can re-scan without touching GitHub Actions secrets or server env vars.

**Architecture:** On `events.LoggedOut`, the backend removes the stale client, generates a fresh QR, and posts it as a photo to a configured Telegram chat. Admin scans from phone. If admin misses that QR, a protected REST endpoint (`GET /api/devices/:uuid/qr`) lets them trigger a fresh one from any browser. WA session lives in PostgreSQL—zero WA-related secrets ever change post-initial-setup.

**Tech Stack:** Go (Fiber), go.mau.fi/whatsmeow (already in use), Telegram Bot API (`sendPhoto` via multipart HTTP), PostgreSQL session storage (already configured).

---

## Context: Why No Secrets Need to Change

`whatsmeow` stores the WA session (device keys, JID, etc.) directly in PostgreSQL via `sqlstore.NewWithDB`. When the app restarts, `StartAllDevices()` reconnects automatically. The only scenario requiring human action is a full WA logout (`events.LoggedOut`). The fix: auto-generate QR on that event and deliver it to admin via Telegram. The Telegram bot token and chat ID are set **once** at deploy time and never change.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `backend/configs/config.go` | Add `TelegramBotToken`, `TelegramChatID` |
| Create | `backend/internal/notify/telegram.go` | Send text + photo to Telegram |
| Modify | `backend/internal/whatsapp/client.go` | `GetQROnce()`, auto-reconnect on logout |
| Modify | `backend/internal/device/handler.go` | `GetDeviceQR` HTTP handler |
| Modify | `backend/internal/router/routes.go` | Register `GET /api/devices/:uuid/qr` |
| Modify | `backend/.env.example` | Document new env vars |

---

## Task 1: Add Telegram Config Fields

**Files:**
- Modify: `backend/configs/config.go`

- [ ] **Step 1: Add fields to Config struct**

Open `backend/configs/config.go`. Add two fields to the `Config` struct (after `JWTSecret`):

```go
type Config struct {
	ServerPort          string
	DBHost              string
	DBPort              string
	DBUser              string
	DBPassword          string
	DBName              string
	RedisHost           string
	RedisPort           string
	RedisPassword       string
	RedisDB             int
	JWTSecret           string
	UploadDir           string
	TelegramBotToken    string
	TelegramChatID      string
}
```

- [ ] **Step 2: Load from env in LoadConfig**

In the `return &Config{...}` block, append:

```go
TelegramBotToken: getEnvVal("TELEGRAM_BOT_TOKEN", ""),
TelegramChatID:   getEnvVal("TELEGRAM_CHAT_ID", ""),
```

- [ ] **Step 3: Commit**

```bash
git add backend/configs/config.go
git commit -m "feat(config): add TelegramBotToken and TelegramChatID env vars"
```

---

## Task 2: Create Telegram Notification Package

**Files:**
- Create: `backend/internal/notify/telegram.go`

- [ ] **Step 1: Create the file**

Create `backend/internal/notify/telegram.go` with the following content:

```go
package notify

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"log"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

// SendQRCode posts a QR image to the configured Telegram chat.
// qrBase64 must be "data:image/png;base64,<data>" as produced by GenerateQR.
// If TelegramBotToken or TelegramChatID is empty, it logs and returns nil.
func SendQRCode(botToken, chatID, deviceName, qrBase64 string) error {
	if botToken == "" || chatID == "" {
		log.Printf("[notify] Telegram not configured — skip QR notify for device %q", deviceName)
		return nil
	}

	// Strip data URI prefix
	b64data := qrBase64
	if idx := strings.Index(qrBase64, ","); idx != -1 {
		b64data = qrBase64[idx+1:]
	}

	pngBytes, err := base64.StdEncoding.DecodeString(b64data)
	if err != nil {
		return fmt.Errorf("decode QR base64: %w", err)
	}

	var body bytes.Buffer
	w := multipart.NewWriter(&body)

	_ = w.WriteField("chat_id", chatID)
	_ = w.WriteField("caption", fmt.Sprintf(
		"📱 Device *%s* disconnected.\nScan this QR to reconnect.\n_(expires in ~20 seconds)_",
		deviceName,
	))
	_ = w.WriteField("parse_mode", "Markdown")

	fw, err := w.CreateFormFile("photo", "qr.png")
	if err != nil {
		return fmt.Errorf("create form file: %w", err)
	}
	if _, err = fw.Write(pngBytes); err != nil {
		return fmt.Errorf("write png bytes: %w", err)
	}
	w.Close()

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", botToken)
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodPost, url, &body)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("telegram sendPhoto: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram sendPhoto status %d", resp.StatusCode)
	}

	log.Printf("[notify] QR sent to Telegram for device %q", deviceName)
	return nil
}

// SendText posts a plain text message to the configured Telegram chat.
func SendText(botToken, chatID, text string) error {
	if botToken == "" || chatID == "" {
		return nil
	}

	payload := fmt.Sprintf(`{"chat_id":"%s","text":%q}`, chatID, text)
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd backend && go build ./internal/notify/...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/notify/telegram.go
git commit -m "feat(notify): add Telegram QR notification package"
```

---

## Task 3: Add GetQROnce + Auto-Reconnect on Logout

**Files:**
- Modify: `backend/internal/whatsapp/client.go`

### Step 1: Add `GetQROnce` method

This is a helper that starts QR generation and returns only the **first** QR code, then closes. HTTP handlers use this.

- [ ] **Step 1: Add import for notify and time**

The `time` package is already imported. Add `"whatapps/backend/internal/notify"` to the import block:

```go
import (
	"context"
	"database/sql"
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"whatapps/backend/configs"
	"whatapps/backend/internal/autoreply"
	"whatapps/backend/internal/model"
	"whatapps/backend/internal/notify"
	"whatapps/backend/pkg/database"
	"whatapps/backend/pkg/logger"

	"github.com/google/uuid"
	"github.com/skip2/go-qrcode"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"google.golang.org/protobuf/proto"
)
```

- [ ] **Step 2: Add GetQROnce method**

Insert this function after `GenerateQR` (around line 220):

```go
// GetQROnce starts QR generation and returns the first QR code received.
// Returns error if device is already connected or QR times out.
func (cm *ClientManager) GetQROnce(deviceID uint64, timeout time.Duration) (string, error) {
	qrChan := make(chan string, 1)
	doneChan := make(chan bool, 1)

	go cm.GenerateQR(deviceID, qrChan, doneChan)

	select {
	case qr := <-qrChan:
		return qr, nil
	case done := <-doneChan:
		if done {
			return "", fmt.Errorf("device already connected")
		}
		return "", fmt.Errorf("QR generation failed or timed out")
	case <-time.After(timeout):
		return "", fmt.Errorf("timeout waiting for QR code")
	}
}
```

- [ ] **Step 3: Replace the LoggedOut handler**

Find the existing `case *events.LoggedOut:` block (currently around line 573):

**Before:**
```go
case *events.LoggedOut:
    log.Printf("Device %d logged out", deviceID)
    var device model.Device
    if err := database.DB.First(&device, deviceID).Error; err == nil {
        device.Status = "DISCONNECTED"
        database.DB.Save(&device)
        
        PublishWebSocketEvent(deviceID, "device_disconnected", map[string]interface{}{
            "device_id": deviceID,
            "status":    "DISCONNECTED",
        })
    }
```

**Replace with:**
```go
case *events.LoggedOut:
    log.Printf("Device %d logged out from WhatsApp", deviceID)
    var device model.Device
    if err := database.DB.First(&device, deviceID).Error; err != nil {
        log.Printf("Device %d not found in DB on logout: %v", deviceID, err)
        return
    }

    device.Status = "DISCONNECTED"
    database.DB.Save(&device)

    // Remove stale client so GetOrCreateClient makes a fresh one
    cm.mu.Lock()
    delete(cm.clients, deviceID)
    cm.mu.Unlock()

    PublishWebSocketEvent(deviceID, "device_disconnected", map[string]interface{}{
        "device_id": deviceID,
        "status":    "DISCONNECTED",
    })

    // Auto-generate QR and send to Telegram
    go func(dev model.Device) {
        qr, err := cm.GetQROnce(dev.ID, 30*time.Second)
        if err != nil {
            log.Printf("[auto-reconnect] Device %d QR generation failed: %v", dev.ID, err)
            return
        }
        if err := notify.SendQRCode(
            cm.cfg.TelegramBotToken,
            cm.cfg.TelegramChatID,
            dev.DeviceName,
            qr,
        ); err != nil {
            log.Printf("[auto-reconnect] Telegram notify failed for device %d: %v", dev.ID, err)
        }
    }(device)
```

Note: `handleEvent` is a method so it doesn't hold any lock. The `cm.mu.Lock()` above is safe.

- [ ] **Step 4: Verify compilation**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/whatsapp/client.go
git commit -m "feat(whatsapp): auto-generate QR and notify Telegram on device logout"
```

---

## Task 4: Add REST QR Endpoint Handler

**Files:**
- Modify: `backend/internal/device/handler.go`

- [ ] **Step 1: Add GetDeviceQR handler**

Open `backend/internal/device/handler.go`. Add this function at the end of the file:

```go
// GetDeviceQR generates a fresh QR code for a disconnected device.
// Returns { "connected": true } if device is already connected.
// Returns { "connected": false, "qr": "data:image/png;base64,..." } otherwise.
func GetDeviceQR(c *fiber.Ctx) error {
	uuidParam := c.Params("uuid")

	var device model.Device
	if err := database.DB.Where("uuid = ?", uuidParam).First(&device).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "device not found"})
	}

	// Verify ownership: the requesting user must own this device
	userID, ok := c.Locals("user_id").(uint64)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid user context"})
	}
	var count int64
	database.DB.Table("user_devices").
		Where("user_id = ? AND device_id = ?", userID, device.ID).
		Count(&count)
	if count == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "access denied"})
	}

	if device.Status == "CONNECTED" {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{"connected": true, "qr": nil})
	}

	qr, err := whatsapp.Manager.GetQROnce(device.ID, 30*time.Second)
	if err != nil {
		if err.Error() == "device already connected" {
			return c.Status(fiber.StatusOK).JSON(fiber.Map{"connected": true, "qr": nil})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{"connected": false, "qr": qr})
}
```

- [ ] **Step 2: Add missing imports**

Check current imports at the top of `backend/internal/device/handler.go`. Add any missing ones:
- `"time"` (for `30*time.Second`)
- `"whatapps/backend/internal/whatsapp"` (for `whatsapp.Manager`)

The full import block should include at minimum:

```go
import (
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/internal/whatsapp"
	"whatapps/backend/pkg/database"
	"github.com/gofiber/fiber/v2"
)
```

Keep any existing imports that are already there — only add what's missing.

- [ ] **Step 3: Verify compilation**

```bash
cd backend && go build ./internal/device/...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/device/handler.go
git commit -m "feat(device): add GetDeviceQR REST endpoint"
```

---

## Task 5: Register the QR Route

**Files:**
- Modify: `backend/internal/router/routes.go`

- [ ] **Step 1: Add route to devices group**

Find the `devicesGroup` section (around line 52):

```go
devicesGroup := apiGroup.Group("/devices")
devicesGroup.Post("/", auth.PermissionMiddleware("devices:create"), device.CreateDevice)
devicesGroup.Get("/", auth.PermissionMiddleware("devices:read"), device.ListDevices)
devicesGroup.Get("/:uuid", auth.PermissionMiddleware("devices:read"), device.GetDevice)
```

Add one line after `GetDevice`:

```go
devicesGroup.Get("/:uuid/qr", auth.PermissionMiddleware("devices:read"), device.GetDeviceQR)
```

- [ ] **Step 2: Verify compilation**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/router/routes.go
git commit -m "feat(router): register GET /api/devices/:uuid/qr endpoint"
```

---

## Task 6: Document New Env Vars

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Open .env.example and check its current content**

Look for the end of the file and append:

```env
# Telegram Notification (optional — set to receive QR via Telegram when device logs out)
# Create a bot via @BotFather, add it to your group/chat, get the chat ID via @userinfobot
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Do the same for `backend/.env.prod.example` if it exists.

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example backend/.env.prod.example
git commit -m "docs(env): document TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID"
```

---

## Task 7: Manual Integration Test

No automated test needed here (Telegram calls are external). Verify manually:

- [ ] **Step 1: Set up Telegram bot**

1. Message `@BotFather` on Telegram → `/newbot` → follow steps → copy bot token
2. Add the bot to your personal chat or a group
3. Get chat ID: message `@userinfobot` for personal, or send a message in the group then call `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `result[0].message.chat.id`

- [ ] **Step 2: Add to local .env**

```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=987654321
```

- [ ] **Step 3: Start the server**

```bash
cd backend && go run ./cmd/server/main.go
```

Expected: server starts, no errors.

- [ ] **Step 4: Test REST QR endpoint**

Login first:
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@whatapps.com","password":"adminpassword"}' \
  | jq -r '.token')

# Get QR for a disconnected device (replace UUID with real one from GET /api/devices)
curl -X GET http://localhost:8000/api/devices/<DEVICE_UUID>/qr \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: `{"connected": false, "qr": "data:image/png;base64,..."}` OR `{"connected": true, "qr": null}`

- [ ] **Step 5: Test Telegram notification**

Simulate a logout event by calling the logout endpoint or disconnecting the device. Check your Telegram chat — a QR image should arrive within 30 seconds.

---

## Self-Review

### Spec Coverage Check

| Requirement | Covered |
|---|---|
| No manual env var updates when WA disconnects | ✓ Session in DB (was already done), bot token set once |
| Notification when device logs out | ✓ Task 3: auto-notify on `events.LoggedOut` |
| QR delivered without opening frontend | ✓ Telegram photo in Task 3 |
| Fallback way to get QR manually | ✓ REST endpoint in Tasks 4–5 |
| Telegram unconfigured = graceful skip | ✓ `notify.SendQRCode` returns nil if token/chatID empty |

### Type Consistency

- `GetQROnce(deviceID uint64, timeout time.Duration) (string, error)` — used consistently in both handler and logout goroutine
- `notify.SendQRCode(botToken, chatID, deviceName, qrBase64 string) error` — called with `cm.cfg.TelegramBotToken`, `cm.cfg.TelegramChatID` — matches `Config` field names added in Task 1
- `device.DeviceName` — existing field on `model.Device`, used in notify call

### No Placeholder Check

All steps contain complete code. No TBD, TODO, or "implement later" phrases.
