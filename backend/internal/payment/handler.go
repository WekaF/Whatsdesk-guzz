package payment

import (
	"bytes"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"whatapps/backend/internal/model"
	"whatapps/backend/pkg/database"

	"github.com/gofiber/fiber/v2"
)

type CheckoutRequest struct {
	Tier string `json:"tier"`
}

type MidtransSnapRequest struct {
	TransactionDetails struct {
		OrderID     string `json:"order_id"`
		GrossAmount int64  `json:"gross_amount"`
	} `json:"transaction_details"`
	CreditCard struct {
		Secure bool `json:"secure"`
	} `json:"credit_card"`
	CustomerDetails struct {
		FirstName string `json:"first_name"`
		Email     string `json:"email"`
	} `json:"customer_details"`
}

type MidtransWebhookPayload struct {
	OrderID           string `json:"order_id"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	TransactionStatus string `json:"transaction_status"`
	PaymentType       string `json:"payment_type"`
	FraudStatus       string `json:"fraud_status"`
}

func Checkout(c *fiber.Ctx) error {
	var req CheckoutRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot parse request body"})
	}

	if req.Tier == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Subscription tier is required"})
	}

	// Retrieve current user
	userID := c.Locals("user_id").(uint64)
	var user model.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	// Map tier to price
	var price int64
	switch req.Tier {
	case "lite":
		price = 150000
	case "regular":
		price = 350000
	case "pro":
		price = 750000
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid subscription tier selected"})
	}

	// Create unique order ID
	orderID := fmt.Sprintf("WD-ORD-%d-%d", user.ID, time.Now().Unix())

	// Call Midtrans Snap API
	serverKey := os.Getenv("MIDTRANS_SERVER_KEY")
	if serverKey == "" {
		log.Println("Warning: MIDTRANS_SERVER_KEY is not set in environment")
		// Sandbox fallback key for testing
		serverKey = "SB-Mid-server-placeholder"
	}

	isProduction := os.Getenv("MIDTRANS_IS_PRODUCTION") == "true"
	snapURL := "https://app.sandbox.midtrans.com/snap/v1/transactions"
	if isProduction {
		snapURL = "https://app.midtrans.com/snap/v1/transactions"
	}

	var snapReq MidtransSnapRequest
	snapReq.TransactionDetails.OrderID = orderID
	snapReq.TransactionDetails.GrossAmount = price
	snapReq.CreditCard.Secure = true
	snapReq.CustomerDetails.FirstName = user.Name
	snapReq.CustomerDetails.Email = user.Email

	reqJSON, err := json.Marshal(snapReq)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to serialize payment details"})
	}

	httpReq, err := http.NewRequest("POST", snapURL, bytes.NewBuffer(reqJSON))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create payment gateway request"})
	}

	// Basic Auth credentials base64 encoded
	authStr := base64.StdEncoding.EncodeToString([]byte(serverKey + ":"))

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.Header.Set("Authorization", "Basic "+authStr)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("Midtrans Request Error: %v", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Failed to connect to payment gateway"})
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		log.Printf("Midtrans Error Response (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "Payment gateway returned error"})
	}

	var snapRes struct {
		Token       string `json:"token"`
		RedirectURL string `json:"redirect_url"`
	}
	if err := json.Unmarshal(bodyBytes, &snapRes); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse payment gateway response"})
	}

	// Save transaction history
	tx := model.Transaction{
		UserID:    user.ID,
		OrderID:   orderID,
		Amount:    price,
		Tier:      req.Tier,
		Status:    "pending",
		SnapToken: snapRes.Token,
	}

	if err := database.DB.Create(&tx).Error; err != nil {
		log.Printf("Database Error creating transaction: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save transaction details"})
	}

	return c.JSON(fiber.Map{
		"snap_token":   snapRes.Token,
		"redirect_url": snapRes.RedirectURL,
		"order_id":     orderID,
	})
}

func HandleWebhook(c *fiber.Ctx) error {
	var payload MidtransWebhookPayload
	if err := c.BodyParser(&payload); err != nil {
		log.Printf("Webhook Parsing Error: %v", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Cannot parse webhook payload"})
	}

	// Verify signature key
	serverKey := os.Getenv("MIDTRANS_SERVER_KEY")
	signaturePayload := payload.OrderID + payload.StatusCode + payload.GrossAmount + serverKey
	hasher := sha512.New()
	hasher.Write([]byte(signaturePayload))
	localSignature := hex.EncodeToString(hasher.Sum(nil))

	if localSignature != payload.SignatureKey {
		log.Printf("Invalid Webhook Signature for order %s. Payload sig: %s, Local sig: %s", 
			payload.OrderID, payload.SignatureKey, localSignature)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid signature key"})
	}

	// Retrieve transaction from database
	var tx model.Transaction
	if err := database.DB.Where("order_id = ?", payload.OrderID).First(&tx).Error; err != nil {
		log.Printf("Transaction not found for order_id: %s", payload.OrderID)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Transaction not found"})
	}

	// Process status
	// settlement or capture (with accept fraud status) means successful payment
	status := "pending"
	isSettled := false

	if payload.TransactionStatus == "settlement" || 
		(payload.TransactionStatus == "capture" && payload.FraudStatus == "accept") {
		status = "settlement"
		isSettled = true
	} else if payload.TransactionStatus == "expire" {
		status = "expire"
	} else if payload.TransactionStatus == "cancel" || payload.TransactionStatus == "deny" {
		status = "cancel"
	}

	tx.Status = status
	tx.PaymentType = payload.PaymentType
	if err := database.DB.Save(&tx).Error; err != nil {
		log.Printf("Failed to update transaction %s: %v", payload.OrderID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update transaction status"})
	}

	if isSettled {
		// Upgrade subscription for the user
		var user model.User
		if err := database.DB.First(&user, tx.UserID).Error; nil == err {
			now := time.Now()
			var newEndsAt time.Time
			
			// If already subscribed to the same tier and it's active, extend it. Otherwise start from now.
			if user.SubscriptionTier == tx.Tier && user.SubscriptionEndsAt != nil && user.SubscriptionEndsAt.After(now) {
				newEndsAt = user.SubscriptionEndsAt.AddDate(0, 1, 0)
			} else {
				newEndsAt = now.AddDate(0, 1, 0)
			}

			user.SubscriptionTier = tx.Tier
			user.SubscriptionEndsAt = &newEndsAt
			user.MonthlyMessageSent = 0
			user.MessageResetAt = newEndsAt

			if err := database.DB.Save(&user).Error; err != nil {
				log.Printf("Failed to update user subscription: %v", err)
			} else {
				log.Printf("Successfully upgraded user %s (ID %d) to tier %s until %s", 
					user.Email, user.ID, tx.Tier, newEndsAt.Format("2006-01-02"))

				// Propagate to all child staff accounts
				err = database.DB.Model(&model.User{}).
					Where("parent_id = ?", user.ID).
					Updates(map[string]interface{}{
						"subscription_tier":    tx.Tier,
						"subscription_ends_at": &newEndsAt,
						"monthly_message_sent": 0,
						"message_reset_at":     newEndsAt,
					}).Error
				if err != nil {
					log.Printf("Warning: Failed to propagate subscription upgrade to child accounts: %v", err)
				}
			}
		}
	}

	return c.SendStatus(fiber.StatusOK)
}
