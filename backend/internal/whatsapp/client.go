package whatsapp

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
	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"whatapps/backend/internal/autoreply"
	"whatapps/backend/internal/notify"
	"whatapps/backend/pkg/logger"

	"github.com/google/uuid"
	"github.com/skip2/go-qrcode" // For converting QR code bytes to base64 images
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"google.golang.org/protobuf/proto"
)

type ClientManager struct {
	container *sqlstore.Container
	clients   map[uint64]*whatsmeow.Client
	mu        sync.RWMutex
	cfg       *configs.Config
}

var Manager *ClientManager

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
		err := client.Connect()
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

	err = client.Connect()
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
					database.DB.Save(&device)
					
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
					database.DB.Save(&device)
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
			return "", fmt.Errorf("device already connected")
		}
		return "", fmt.Errorf("QR generation failed or timed out")
	case <-time.After(timeout):
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

	// Resolve local path (frontend sends e.g. "/uploads/file.pdf")
	localPath := "." + mediaURL
	if !strings.HasPrefix(mediaURL, "/uploads/") {
		localPath = filepath.Join(".", "uploads", filepath.Base(mediaURL))
	}

	fileBytes, err := os.ReadFile(localPath)
	if err != nil {
		return "", fmt.Errorf("failed to read local media file: %w", err)
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
					mediaURL = "/uploads/" + savedName
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
					mediaURL = "/uploads/" + savedName
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
		err := database.DB.Where("device_id = ? AND phone = ? AND status != 'Closed'", deviceID, realPhone).Order("updated_at DESC").First(&activeTask).Error
		if err == nil && activeTask.ID != 0 {
			taskID = &activeTask.ID
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

		// 3. Trigger Auto Reply matching asynchronously
		go autoreply.MatchAndTriggerReply(deviceID, &msg)

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
	}
}

// WebSocket publish placeholder to avoid circular imports.
// Will be overridden in server initialization by the actual WebSocket router handlers.
var PublishWebSocketEvent = func(deviceID uint64, eventType string, data interface{}) {
	log.Printf("WebSocket Event Published: DeviceID=%d, Type=%s, Data=%v", deviceID, eventType, data)
}
