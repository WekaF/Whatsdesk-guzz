package whatsapp

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"whatapps/backend/configs"
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"whatapps/backend/internal/autoreply"
	"whatapps/backend/internal/notify"
	"whatapps/backend/pkg/logger"

	"github.com/google/uuid"
	"github.com/skip2/go-qrcode" // For converting QR code bytes to base64 images
	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

// ErrDeviceAlreadyConnected is returned by GetQROnce when the device is already connected.
var ErrDeviceAlreadyConnected = errors.New("device already connected")

type ClientManager struct {
	container        *sqlstore.Container
	clients          map[uint64]*whatsmeow.Client
	mu               sync.RWMutex
	cfg              *configs.Config
	activeReconnects sync.Map // map[uint64]bool — devices currently reconnecting
}

var Manager *ClientManager
var connectMu sync.Mutex

func InitManager(cfg *configs.Config, sqlDB *sql.DB) *ClientManager {
	// Initialize whatsmeow store container
	container := sqlstore.NewWithDB(sqlDB, "postgres", nil)

	// Upgrade whatsmeow schema to create session tables
	err := container.Upgrade(context.Background())
	if err != nil {
		log.Fatalf("Failed to run database schema upgrades for whatsmeow: %v", err)
	}

	Manager = &ClientManager{
		container: container,
		clients:   make(map[uint64]*whatsmeow.Client),
		cfg:       cfg,
	}

	return Manager
}

// StartAllDevices connects all previously connected devices in database on startup
func (cm *ClientManager) StartAllDevices() {
	var devices []model.Device
	if err := database.DB.Where("status = ?", "CONNECTED").Find(&devices).Error; err != nil {
		log.Printf("Failed to load active devices from database: %v", err)
		return
	}

	for _, dev := range devices {
		go func(d model.Device) {
			log.Printf("Auto-reconnecting device %s (%s)", d.DeviceName, d.Phone)
			_, err := cm.GetOrCreateClient(d.ID)
			if err != nil {
				log.Printf("Failed to auto-reconnect device ID %d: %v", d.ID, err)
			}
		}(dev)
	}
}

// GetOrCreateClient retrieves an existing client or initializes a new whatsmeow client
func (cm *ClientManager) GetOrCreateClient(deviceID uint64) (*whatsmeow.Client, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if client, exists := cm.clients[deviceID]; exists {
		return client, nil
	}

	// Fetch device info from db
	var device model.Device
	if err := database.DB.First(&device, deviceID).Error; err != nil {
		return nil, fmt.Errorf("device not found in db: %w", err)
	}

	var deviceStore *store.Device
	if device.JID != "" {
		jid, err := types.ParseJID(device.JID)
		if err != nil {
			return nil, fmt.Errorf("invalid device JID: %w", err)
		}
		deviceStore, err = cm.container.GetDevice(context.Background(), jid)
		if err != nil {
			return nil, fmt.Errorf("failed to get device store: %w", err)
		}
	}

	if deviceStore == nil {
		deviceStore = cm.container.NewDevice()
	}

	logLevel := "WARN"
	client := whatsmeow.NewClient(deviceStore, logger.NewWhatsMeowLogger("Whatsmeow", logger.MultiWriter, logLevel))
	cm.clients[deviceID] = client

	// Register Event Handler
	client.AddEventHandler(func(evt interface{}) {
		cm.handleEvent(deviceID, evt)
	})

	// If already logged in, connect automatically
	if client.Store.ID != nil {
		connectMu.Lock()
		store.DeviceProps.Os = proto.String(cm.cfg.DefaultDeviceName + " - " + device.DeviceName)
		store.DeviceProps.PlatformType = parsePlatformType(cm.cfg.DevicePlatform).Enum()
		err := client.Connect()
		connectMu.Unlock()
		if err != nil {
			return nil, fmt.Errorf("failed to connect: %w", err)
		}
	}

	return client, nil
}

func (cm *ClientManager) DisconnectClient(deviceID uint64) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if client, exists := cm.clients[deviceID]; exists {
		client.Disconnect()
		delete(cm.clients, deviceID)
		log.Printf("Disconnected client for device ID %d", deviceID)
	}
}

// GenerateQR starts connection process and returns a channel of base64 encoded QR images
func (cm *ClientManager) GenerateQR(deviceID uint64, qrChan chan<- string, doneChan chan<- bool) {
	client, err := cm.GetOrCreateClient(deviceID)
	if err != nil {
		log.Printf("Failed to get client for QR generation: %v", err)
		doneChan <- false
		return
	}

	if client.IsConnected() && client.Store.ID != nil {
		log.Printf("Device %d already connected", deviceID)
		doneChan <- true
		return
	}

	if client.IsConnected() {
		client.Disconnect()
	}

	ch, err := client.GetQRChannel(context.Background())
	if err != nil {
		log.Printf("Failed to get QR channel: %v", err)
		doneChan <- false
		return
	}

	// Fetch device info from db for display name
	var device model.Device
	deviceName := cm.cfg.DefaultDeviceName
	if err := database.DB.First(&device, deviceID).Error; err == nil && device.DeviceName != "" {
		deviceName = cm.cfg.DefaultDeviceName + " - " + device.DeviceName
	}

	connectMu.Lock()
	store.DeviceProps.Os = proto.String(deviceName)
	store.DeviceProps.PlatformType = parsePlatformType(cm.cfg.DevicePlatform).Enum()
	err = client.Connect()
	connectMu.Unlock()
	if err != nil {
		log.Printf("Failed to connect client: %v", err)
		doneChan <- false
		return
	}

	go func() {
		for evt := range ch {
			if evt.Event == "code" {
				// Convert raw QR string to png base64 image
				png, err := qrcode.Encode(evt.Code, qrcode.Medium, 256)
				if err != nil {
					log.Printf("Failed to encode QR: %v", err)
					continue
				}
				qrBase64 := base64.StdEncoding.EncodeToString(png)
				qrChan <- fmt.Sprintf("data:image/png;base64,%s", qrBase64)
			} else if evt.Event == "success" {
				log.Printf("QR code scanned successfully for device %d", deviceID)

				// Update device status in db
				var device model.Device
				if err := database.DB.First(&device, deviceID).Error; err == nil {
					device.Status = "CONNECTED"
					device.JID = client.Store.ID.String()
					device.Phone = client.Store.ID.User
					if err := database.DB.Save(&device).Error; err != nil {
						log.Printf("Failed to save device status for device %d: %v", deviceID, err)
					}

					// Trigger WS update (to be integrated)
					PublishWebSocketEvent(deviceID, "device_connected", map[string]interface{}{
						"device_id": deviceID,
						"phone":     device.Phone,
						"status":    "CONNECTED",
					})
				}
				doneChan <- true
				return
			} else if evt.Event == "timeout" {
				log.Printf("QR code generation timed out for device %d", deviceID)

				var device model.Device
				if err := database.DB.First(&device, deviceID).Error; err == nil {
					device.Status = "DISCONNECTED"
					if err := database.DB.Save(&device).Error; err != nil {
						log.Printf("Failed to save device status for device %d: %v", deviceID, err)
					}
				}
				doneChan <- false
				return
			}
		}
	}()
}

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
			return "", ErrDeviceAlreadyConnected
		}
		return "", fmt.Errorf("QR generation failed or timed out")
	case <-time.After(timeout):
		// GenerateQR goroutine is orphaned here but bounded: whatsmeow closes
		// the QR channel on its own timeout (~20s), so the goroutine exits naturally.
		return "", fmt.Errorf("timeout waiting for QR code")
	}
}

// SendTextMessage sends a plain text message to a specific phone number
func (cm *ClientManager) SendTextMessage(deviceID uint64, phone string, text string) (string, error) {
	cm.mu.RLock()
	client, exists := cm.clients[deviceID]
	cm.mu.RUnlock()

	if !exists || client == nil {
		// Try to initialize it
		var err error
		client, err = cm.GetOrCreateClient(deviceID)
		if err != nil {
			return "", fmt.Errorf("client not initialized and cannot start: %w", err)
		}
	}

	if !client.IsConnected() {
		return "", fmt.Errorf("whatsmeow client is not connected")
	}

	var recipient types.JID
	var err error
	if strings.Contains(phone, "@") {
		recipient, err = types.ParseJID(phone)
	} else {
		var isLID bool
		database.DB.Raw("SELECT EXISTS(SELECT 1 FROM whatsmeow_lid_map WHERE split_part(lid, '@', 1) = ?)", phone).Scan(&isLID)
		if isLID {
			recipient, err = types.ParseJID(phone + "@lid")
		} else {
			recipient, err = types.ParseJID(phone + "@s.whatsapp.net")
		}
	}
	if err != nil {
		return "", fmt.Errorf("invalid target phone number or JID: %w", err)
	}

	messageProto := &waProto.Message{
		Conversation: proto.String(text),
	}

	resp, err := client.SendMessage(context.Background(), recipient, messageProto)
	if err != nil {
		return "", fmt.Errorf("failed to send message: %w", err)
	}

	return resp.ID, nil
}

// SendMediaMessage uploads and sends an image or PDF/document message.
func (cm *ClientManager) SendMediaMessage(deviceID uint64, phone string, messageType string, mediaURL string, fileName string, caption string) (string, error) {
	cm.mu.RLock()
	client, exists := cm.clients[deviceID]
	cm.mu.RUnlock()

	if !exists || client == nil {
		var err error
		client, err = cm.GetOrCreateClient(deviceID)
		if err != nil {
			return "", fmt.Errorf("client not initialized and cannot start: %w", err)
		}
	}

	if !client.IsConnected() {
		return "", fmt.Errorf("whatsmeow client is not connected")
	}

	var recipient types.JID
	var err error
	if strings.Contains(phone, "@") {
		recipient, err = types.ParseJID(phone)
	} else {
		var isLID bool
		database.DB.Raw("SELECT EXISTS(SELECT 1 FROM whatsmeow_lid_map WHERE split_part(lid, '@', 1) = ?)", phone).Scan(&isLID)
		if isLID {
			recipient, err = types.ParseJID(phone + "@lid")
		} else {
			recipient, err = types.ParseJID(phone + "@s.whatsapp.net")
		}
	}
	if err != nil {
		return "", fmt.Errorf("invalid target phone number or JID: %w", err)
	}

	// Resolve local path (mediaURL could be absolute URL like http://domain/uploads/file.pdf or relative like /uploads/file.pdf)
	var localPath string
	if idx := strings.Index(mediaURL, "/uploads/"); idx != -1 {
		filename := mediaURL[idx+len("/uploads/"):]
		if qIdx := strings.Index(filename, "?"); qIdx != -1 {
			filename = filename[:qIdx]
		}
		localPath = filepath.Join(cm.cfg.UploadDir, filename)
	} else if !strings.HasPrefix(mediaURL, "http://") && !strings.HasPrefix(mediaURL, "https://") {
		localPath = filepath.Join(cm.cfg.UploadDir, filepath.Base(mediaURL))
	}

	var fileBytes []byte
	if localPath != "" {
		fileBytes, err = os.ReadFile(localPath)
	}

	// If local read failed or mediaURL is an external URL, attempt to download it
	if err != nil || fileBytes == nil {
		if strings.HasPrefix(mediaURL, "http://") || strings.HasPrefix(mediaURL, "https://") {
			log.Printf("Media file not found locally. Downloading from: %s", mediaURL)
			httpClient := &http.Client{Timeout: 30 * time.Second}
			resp, httpErr := httpClient.Get(mediaURL)
			if httpErr != nil {
				return "", fmt.Errorf("failed to download media from URL: %w", httpErr)
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				return "", fmt.Errorf("failed to download media, status code: %d", resp.StatusCode)
			}

			fileBytes, err = io.ReadAll(resp.Body)
			if err != nil {
				return "", fmt.Errorf("failed to read downloaded media bytes: %w", err)
			}
		} else {
			return "", fmt.Errorf("failed to read local media file: %w", err)
		}
	}

	var waMediaType whatsmeow.MediaType
	var mimeType string
	if messageType == "image" {
		waMediaType = whatsmeow.MediaImage
		mimeType = http.DetectContentType(fileBytes)
		if !strings.HasPrefix(mimeType, "image/") {
			mimeType = "image/jpeg"
		}
	} else {
		waMediaType = whatsmeow.MediaDocument
		mimeType = "application/pdf"
		if ext := filepath.Ext(fileName); ext != "" {
			if ext == ".pdf" {
				mimeType = "application/pdf"
			} else if ext == ".txt" {
				mimeType = "text/plain"
			} else if ext == ".zip" {
				mimeType = "application/zip"
			}
		}
	}

	resp, err := client.Upload(context.Background(), fileBytes, waMediaType)
	if err != nil {
		return "", fmt.Errorf("failed to upload media to WhatsApp: %w", err)
	}

	var messageProto *waProto.Message
	if messageType == "image" {
		imageMsg := &waProto.ImageMessage{
			URL:           proto.String(resp.URL),
			DirectPath:    proto.String(resp.DirectPath),
			MediaKey:      resp.MediaKey,
			Mimetype:      proto.String(mimeType),
			FileEncSHA256: resp.FileEncSHA256,
			FileSHA256:    resp.FileSHA256,
			FileLength:    proto.Uint64(resp.FileLength),
		}
		if caption != "" {
			imageMsg.Caption = proto.String(caption)
		}
		messageProto = &waProto.Message{
			ImageMessage: imageMsg,
		}
	} else {
		if fileName == "" {
			fileName = filepath.Base(localPath)
		}
		docMsg := &waProto.DocumentMessage{
			URL:           proto.String(resp.URL),
			DirectPath:    proto.String(resp.DirectPath),
			MediaKey:      resp.MediaKey,
			Mimetype:      proto.String(mimeType),
			FileEncSHA256: resp.FileEncSHA256,
			FileSHA256:    resp.FileSHA256,
			FileLength:    proto.Uint64(resp.FileLength),
			Title:         proto.String(fileName),
			FileName:      proto.String(fileName),
		}
		if caption != "" {
			docMsg.Caption = proto.String(caption)
		}
		messageProto = &waProto.Message{
			DocumentMessage: docMsg,
		}
	}

	sendResp, err := client.SendMessage(context.Background(), recipient, messageProto)
	if err != nil {
		return "", fmt.Errorf("failed to send media message: %w", err)
	}

	return sendResp.ID, nil
}

// handleEvent processes incoming whatsmeow events (messages, connection logs, etc.)
func (cm *ClientManager) handleEvent(deviceID uint64, evt interface{}) {
	switch v := evt.(type) {
	case *events.Connected:
		log.Printf("Device %d successfully connected to WhatsApp, sending presence available status", deviceID)
		cm.mu.RLock()
		client, exists := cm.clients[deviceID]
		cm.mu.RUnlock()
		if exists && client != nil {
			go func() {
				err := client.SendPresence(context.Background(), types.PresenceAvailable)
				if err != nil {
					log.Printf("Failed to send available presence for device %d: %v", deviceID, err)
				}
			}()
		}

	case *events.Message:
		// Ignore messages from ourselves
		if v.Info.IsFromMe {
			return
		}

		cm.mu.RLock()
		client, exists := cm.clients[deviceID]
		cm.mu.RUnlock()
		if !exists || client == nil {
			log.Printf("Client not found for device ID %d in handleEvent", deviceID)
			return
		}

		// Handle Incoming Message (Text or Media)
		var msgText string
		var messageType = "text"
		var mediaURL = ""
		var fileName = ""

		if v.Message.GetConversation() != "" {
			msgText = v.Message.GetConversation()
		} else if v.Message.GetExtendedTextMessage().GetText() != "" {
			msgText = v.Message.GetExtendedTextMessage().GetText()
		} else if v.Message.ImageMessage != nil {
			messageType = "image"
			msgText = v.Message.ImageMessage.GetCaption()

			// Download image
			data, err := client.Download(context.Background(), v.Message.ImageMessage)
			if err == nil {
				ext := ".jpg"
				if mime := v.Message.ImageMessage.GetMimetype(); mime != "" {
					parts := strings.Split(mime, "/")
					if len(parts) > 1 {
						ext = "." + parts[1]
					}
				}

				uniqueID, _ := uuid.NewRandom()
				savedName := fmt.Sprintf("incoming_%s%s", uniqueID.String(), ext)
				_ = os.MkdirAll("./uploads", os.ModePerm)

				err = os.WriteFile(filepath.Join("./uploads", savedName), data, os.ModePerm)
				if err == nil {
					appURL := strings.TrimSuffix(cm.cfg.AppURL, "/")
					if appURL != "" {
						mediaURL = appURL + "/uploads/" + savedName
					} else {
						mediaURL = "/uploads/" + savedName
					}
				} else {
					log.Printf("Failed to save incoming image file: %v", err)
				}
			} else {
				log.Printf("Failed to download incoming image: %v", err)
			}
		} else if v.Message.DocumentMessage != nil {
			messageType = "document"
			msgText = v.Message.DocumentMessage.GetCaption()
			fileName = v.Message.DocumentMessage.GetTitle()
			if fileName == "" {
				fileName = v.Message.DocumentMessage.GetFileName()
			}
			if fileName == "" {
				fileName = "document"
			}

			// Download document
			data, err := client.Download(context.Background(), v.Message.DocumentMessage)
			if err == nil {
				ext := ".pdf"
				if mime := v.Message.DocumentMessage.GetMimetype(); mime != "" {
					if parts := strings.Split(mime, "/"); len(parts) > 1 {
						ext = "." + parts[1]
					}
				}
				if filepath.Ext(fileName) != "" {
					ext = filepath.Ext(fileName)
				}

				uniqueID, _ := uuid.NewRandom()
				savedName := fmt.Sprintf("incoming_%s%s", uniqueID.String(), ext)
				_ = os.MkdirAll("./uploads", os.ModePerm)

				err = os.WriteFile(filepath.Join("./uploads", savedName), data, os.ModePerm)
				if err == nil {
					appURL := strings.TrimSuffix(cm.cfg.AppURL, "/")
					if appURL != "" {
						mediaURL = appURL + "/uploads/" + savedName
					} else {
						mediaURL = "/uploads/" + savedName
					}
				} else {
					log.Printf("Failed to save incoming document file: %v", err)
				}
			} else {
				log.Printf("Failed to download incoming document: %v", err)
			}
		} else {
			// Ignore other unsupported message types
			return
		}

		log.Printf("Device %d received message from %s (Chat: %s): %s (Type: %s)", deviceID, v.Info.Sender.User, v.Info.Chat.String(), msgText, messageType)

		// 1. Check if there is an active task for this sender
		realPhone := database.ResolveRealPhone(v.Info.Chat.String())
		var activeTask model.Task
		var taskID *uint64
		var webhookURL string
		err := database.DB.Where("device_id = ? AND phone = ? AND status != 'Closed'", deviceID, realPhone).Order("updated_at DESC").First(&activeTask).Error
		if err == nil && activeTask.ID != 0 {
			taskID = &activeTask.ID
			webhookURL = activeTask.WebhookURL
			// Update the updated_at timestamp of the task to indicate activity
			database.DB.Model(&activeTask).Update("updated_at", time.Now())
		}

		// Save to Database
		msg := model.Message{
			DeviceID:    deviceID,
			Direction:   "IN",
			Phone:       v.Info.Chat.String(),
			Message:     msgText,
			Status:      "DELIVERED",
			TaskID:      taskID,
			MessageType: messageType,
			MediaURL:    mediaURL,
			FileName:    fileName,
			CreatedAt:   time.Now(),
		}
		if err := database.DB.Create(&msg).Error; err != nil {
			log.Printf("Failed to save incoming message: %v", err)
			return
		}

		// Log message under the active Task
		if taskID != nil {
			taskInMsg := model.TaskMessage{
				TaskID:      *taskID,
				Direction:   "IN",
				Message:     msgText,
				MessageType: messageType,
				MediaURL:    mediaURL,
				FileName:    fileName,
				CreatedAt:   time.Now(),
			}
			database.DB.Create(&taskInMsg)
		}

		// 2. Dispatch to WebSocket
		PublishWebSocketEvent(deviceID, "message_received", map[string]interface{}{
			"id":           msg.ID,
			"uuid":         msg.UUID,
			"device_id":    deviceID,
			"direction":    "IN",
			"phone":        msg.Phone,
			"message":      msg.Message,
			"status":       msg.Status,
			"task_id":      msg.TaskID,
			"message_type": msg.MessageType,
			"media_url":    msg.MediaURL,
			"file_name":    msg.FileName,
			"created_at":   msg.CreatedAt,
		})

		// 3. Webhook Forwarding or Auto Reply
		if webhookURL != "" {
			// Forward to Webhook and bypass AutoReply engine
			log.Printf("[Webhook Session] Forwarding incoming message from %s to webhook: %s", msg.Phone, webhookURL)
			go func(url string, payload interface{}) {
				body, _ := json.Marshal(payload)
				client := &http.Client{Timeout: 10 * time.Second}
				resp, postErr := client.Post(url, "application/json", bytes.NewBuffer(body))
				if postErr != nil {
					log.Printf("[Webhook Session Error] Failed to post webhook: %v", postErr)
					return
				}
				defer resp.Body.Close()
			}(webhookURL, map[string]interface{}{
				"device_id":    deviceID,
				"phone":        msg.Phone,
				"message":      msg.Message,
				"message_type": msg.MessageType,
				"media_url":    msg.MediaURL,
				"file_name":    msg.FileName,
				"created_at":   msg.CreatedAt,
				"task_id":      taskID,
				"task": map[string]interface{}{
					"id":     activeTask.ID,
					"uuid":   activeTask.UUID,
					"number": activeTask.Number,
					"status": activeTask.Status,
				},
			})
		} else {
			// Trigger standard Auto Reply rules
			go autoreply.MatchAndTriggerReply(deviceID, &msg)
		}

	case *events.Receipt:
		// Update status of sent messages if receipt is delivered/read
		if v.Type == types.ReceiptTypeDelivered || v.Type == types.ReceiptTypeRead {
			for _, messageID := range v.MessageIDs {
				status := "DELIVERED"
				if v.Type == types.ReceiptTypeRead {
					status = "READ"
				}

				// Find out direction OUT message matching WhatsApp JID message ID
				// (in whatsmeow message ID is saved as the jid or message identifier string)
				// We can update the status where message JID/UUID or external ID matches
				// For simple demo, update status in DB
				// Let's use simple query
				// Since we don't save JID inside message table directly in schema, we can look up by status PENDING/SENT
				// Or in a real system we store whatsapp message ID.
				// Let's assume we map it or just log it for now.
				log.Printf("Message receipt received: %s status %s", messageID, status)
			}
		}

	case *events.LoggedOut:
		log.Printf("Device %d logged out from WhatsApp", deviceID)
		var device model.Device
		if err := database.DB.First(&device, deviceID).Error; err != nil {
			log.Printf("Device %d not found in DB on logout: %v", deviceID, err)
			return
		}

		device.Status = "DISCONNECTED"
		if err := database.DB.Save(&device).Error; err != nil {
			log.Printf("Failed to save DISCONNECTED status for device %d: %v", deviceID, err)
		}

		// Remove stale client so GetOrCreateClient makes a fresh one
		func() {
			cm.mu.Lock()
			defer cm.mu.Unlock()
			delete(cm.clients, deviceID)
		}()

		PublishWebSocketEvent(deviceID, "device_disconnected", map[string]interface{}{
			"device_id": deviceID,
			"status":    "DISCONNECTED",
		})

		// Auto-generate QR and send to Telegram
		go func(dev model.Device) {
			if _, loaded := cm.activeReconnects.LoadOrStore(dev.ID, true); loaded {
				log.Printf("[auto-reconnect] Device %d reconnect already in progress, skipping", dev.ID)
				return
			}
			defer cm.activeReconnects.Delete(dev.ID)

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
	}
}

// WebSocket publish placeholder to avoid circular imports.
// Will be overridden in server initialization by the actual WebSocket router handlers.
var PublishWebSocketEvent = func(deviceID uint64, eventType string, data interface{}) {
	log.Printf("WebSocket Event Published: DeviceID=%d, Type=%s, Data=%v", deviceID, eventType, data)
}

func (cm *ClientManager) LogoutDevice(deviceID uint64) error {
	// 1. Get or create the client instance
	client, err := cm.GetOrCreateClient(deviceID)
	if err != nil {
		return err
	}

	// 2. Perform Logout on WhatsApp server or force local disconnect
	if client.IsConnected() {
		err = client.Logout(context.Background())
		if err != nil {
			log.Printf("WhatsApp server logout failed for device ID %d: %v, forcing local disconnect", deviceID, err)
			client.Disconnect()
		}
	} else {
		// Try to connect to unlink cleanly, otherwise delete locally
		err = client.Connect()
		if err == nil {
			_ = client.Logout(context.Background())
		} else {
			if client.Store != nil {
				_ = client.Store.Delete(context.Background())
			}
		}
	}

	// 3. Remove client from memory registry
	cm.mu.Lock()
	delete(cm.clients, deviceID)
	cm.mu.Unlock()

	// 4. Reset connection info in database
	var device model.Device
	if err := database.DB.First(&device, deviceID).Error; err == nil {
		device.Status = "DISCONNECTED"
		device.JID = ""
		device.Phone = ""
		database.DB.Save(&device)
	}

	return nil
}

func parsePlatformType(platform string) waCompanionReg.DeviceProps_PlatformType {
	switch strings.ToUpper(platform) {
	case "CHROME":
		return waCompanionReg.DeviceProps_CHROME
	case "FIREFOX":
		return waCompanionReg.DeviceProps_FIREFOX
	case "SAFARI":
		return waCompanionReg.DeviceProps_SAFARI
	case "DESKTOP":
		return waCompanionReg.DeviceProps_DESKTOP
	case "OPERA":
		return waCompanionReg.DeviceProps_OPERA
	case "EDGE":
		return waCompanionReg.DeviceProps_EDGE
	default:
		return waCompanionReg.DeviceProps_EDGE
	}
}

