package device

import (
	"encoding/json"
	"log"
	"sync"

	"whatapps/backend/configs"
	"whatapps/backend/internal/model"
	"whatapps/backend/internal/whatsapp"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/golang-jwt/jwt/v5"
)

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type ClientConnection struct {
	Conn     *websocket.Conn
	DeviceID uint64
}

type WSRegistry struct {
	connections map[uint64][]*websocket.Conn
	mu          sync.RWMutex
}

var Registry = &WSRegistry{
	connections: make(map[uint64][]*websocket.Conn),
}

// Thread-safe writing utilities for websocket.Conn
var writeMutexes = make(map[*websocket.Conn]*sync.Mutex)
var writeMutexesLock sync.Mutex

func getWriteMutex(c *websocket.Conn) *sync.Mutex {
	writeMutexesLock.Lock()
	defer writeMutexesLock.Unlock()
	mu, exists := writeMutexes[c]
	if !exists {
		mu = &sync.Mutex{}
		writeMutexes[c] = mu
	}
	return mu
}

func deleteWriteMutex(c *websocket.Conn) {
	writeMutexesLock.Lock()
	defer writeMutexesLock.Unlock()
	delete(writeMutexes, c)
}

func safeWriteJSON(c *websocket.Conn, v interface{}) error {
	mu := getWriteMutex(c)
	mu.Lock()
	defer mu.Unlock()
	return c.WriteJSON(v)
}

func safeWriteMessage(c *websocket.Conn, messageType int, data []byte) error {
	mu := getWriteMutex(c)
	mu.Lock()
	defer mu.Unlock()
	return c.WriteMessage(messageType, data)
}

func (r *WSRegistry) Add(deviceID uint64, conn *websocket.Conn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.connections[deviceID] = append(r.connections[deviceID], conn)
	log.Printf("WebSocket client registered for device ID %d", deviceID)
}

func (r *WSRegistry) Remove(deviceID uint64, conn *websocket.Conn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	conns := r.connections[deviceID]
	for i, c := range conns {
		if c == conn {
			r.connections[deviceID] = append(conns[:i], conns[i+1:]...)
			break
		}
	}
	if len(r.connections[deviceID]) == 0 {
		delete(r.connections, deviceID)
	}
	log.Printf("WebSocket client disconnected for device ID %d", deviceID)
}

func (r *WSRegistry) Broadcast(deviceID uint64, eventType string, data interface{}) {
	r.mu.RLock()
	conns, exists := r.connections[deviceID]
	if !exists || len(conns) == 0 {
		r.mu.RUnlock()
		return
	}
	r.mu.RUnlock()

	payload, err := json.Marshal(WSMessage{
		Type: eventType,
		Data: data,
	})
	if err != nil {
		log.Printf("Failed to marshal WS message: %v", err)
		return
	}

	for _, conn := range conns {
		go func(c *websocket.Conn) {
			err := safeWriteMessage(c, websocket.TextMessage, payload)
			if err != nil {
				log.Printf("Failed to write to WS client: %v", err)
			}
		}(conn)
	}
}

// Override whatsapp manager's publish hook
func init() {
	whatsapp.PublishWebSocketEvent = func(deviceID uint64, eventType string, data interface{}) {
		Registry.Broadcast(deviceID, eventType, data)
	}
}

func WebSocketHandler(c *websocket.Conn) {
	deviceUUID := c.Params("uuid")
	if deviceUUID == "" {
		safeWriteJSON(c, fiber.Map{"error": "Invalid device UUID"})
		c.Close()
		return
	}

	// 1. Authenticate using Query token parameter
	tokenString := c.Query("token")
	if tokenString == "" {
		safeWriteJSON(c, fiber.Map{"error": "Unauthorized: missing token"})
		c.Close()
		return
	}

	cfg := configs.LoadConfig()
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(cfg.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		log.Printf("[WS Auth Error] Token verification failed for device UUID %s: %v", deviceUUID, err)
		safeWriteJSON(c, fiber.Map{"error": "Unauthorized: invalid token"})
		c.Close()
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		log.Printf("[WS Auth Error] Failed to parse claims for device UUID %s", deviceUUID)
		safeWriteJSON(c, fiber.Map{"error": "Unauthorized: invalid claims"})
		c.Close()
		return
	}

	userID := uint64(claims["user_id"].(float64))
	role, _ := claims["role"].(string)

	// 2. Validate device ownership
	var device model.Device
	var dbErr error
	if role == "superadmin" {
		dbErr = database.DB.Where("uuid = ?", deviceUUID).First(&device).Error
	} else {
		dbErr = database.DB.Joins("JOIN user_devices ON user_devices.device_id = devices.id").
			Where("devices.uuid = ? AND user_devices.user_id = ?", deviceUUID, userID).
			First(&device).Error
	}
	if dbErr != nil {
		log.Printf("[WS DB Error] Device ownership validation failed for device %s, user %d: %v", deviceUUID, userID, dbErr)
		safeWriteJSON(c, fiber.Map{"error": "Device not found"})
		c.Close()
		return
	}

	deviceID := device.ID

	// Register Connection
	Registry.Add(deviceID, c)
	defer func() {
		Registry.Remove(deviceID, c)
		deleteWriteMutex(c)
	}()

	// Send current status
	safeWriteJSON(c, WSMessage{
		Type: "status_update",
		Data: fiber.Map{
			"status": device.Status,
			"phone":  device.Phone,
		},
	})

	// If device is not connected, trigger QR stream
	if device.Status != "CONNECTED" {
		qrChan := make(chan string)
		doneChan := make(chan bool)

		go whatsapp.Manager.GenerateQR(deviceID, qrChan, doneChan)

		// Create channel reader loop
		go func() {
			for {
				select {
				case qrImage, ok := <-qrChan:
					if !ok {
						return
					}
					safeWriteJSON(c, WSMessage{
						Type: "qr_code",
						Data: fiber.Map{
							"qr": qrImage,
						},
					})
				case success := <-doneChan:
					if success {
						safeWriteJSON(c, WSMessage{
							Type: "status_update",
							Data: fiber.Map{
								"status": "CONNECTED",
							},
						})
					} else {
						safeWriteJSON(c, WSMessage{
							Type: "status_update",
							Data: fiber.Map{
								"status": "DISCONNECTED",
							},
						})
					}
					return
				}
			}
		}()
	}

	// Keep connection open (listen for client messages if any, or just block on read)
	for {
		_, _, err := c.ReadMessage()
		if err != nil {
			break
		}
	}
}
