package notify

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

// SendQRCode posts a QR image to the configured Telegram chat.
// qrBase64 must be "data:image/png;base64,<data>" as produced by GenerateQR.
// If botToken or chatID is empty, it logs and returns nil.
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
		log.Printf("[notify] Telegram not configured — skip text notify")
		return nil
	}

	type sendMessagePayload struct {
		ChatID string `json:"chat_id"`
		Text   string `json:"text"`
	}
	b, err := json.Marshal(sendMessagePayload{ChatID: chatID, Text: text})
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("telegram sendMessage: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram sendMessage status %d", resp.StatusCode)
	}

	log.Printf("[notify] text message sent to Telegram")
	return nil
}
