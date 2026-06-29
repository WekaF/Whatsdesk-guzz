package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Transaction struct {
	ID          uint64         `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID        uuid.UUID      `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	UserID      uint64         `gorm:"index" json:"user_id"`
	User        User           `gorm:"foreignKey:UserID" json:"-"`
	OrderID     string         `gorm:"uniqueIndex;size:100;not null" json:"order_id"`
	Amount      int64          `json:"amount"`
	Tier        string         `gorm:"size:50" json:"tier"`
	Status      string         `gorm:"size:50;default:'pending'" json:"status"` // pending, settlement, expire, cancel, deny
	PaymentType string         `gorm:"size:50" json:"payment_type,omitempty"`
	SnapToken   string         `gorm:"size:255" json:"snap_token,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

func (t *Transaction) BeforeCreate(tx *gorm.DB) (err error) {
	if t.UUID == uuid.Nil {
		t.UUID = uuid.New()
	}
	return nil
}
