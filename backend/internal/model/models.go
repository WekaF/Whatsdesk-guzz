package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID             uint64         `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID           uuid.UUID      `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	Name           string         `gorm:"size:255;not null" json:"name"`
	Nickname       string         `gorm:"size:255" json:"nickname"`
	Email          string         `gorm:"size:255;uniqueIndex;not null" json:"email"`
	Password       string         `gorm:"size:255;not null" json:"-"`
	Role                  string         `gorm:"size:50;default:'user'" json:"role"`
	PhoneNumber           string         `gorm:"size:50" json:"phone_number"`
	IsNotificationEnabled bool           `gorm:"default:false" json:"is_notification_enabled"`
	Devices               []Device       `gorm:"many2many:user_devices;" json:"devices,omitempty"`
	TaskCategories        []TaskCategory `gorm:"many2many:user_task_categories;" json:"task_categories,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
}

func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	if u.UUID == uuid.Nil {
		u.UUID = uuid.New()
	}
	return nil
}

type UserDevice struct {
	UserID   uint64 `gorm:"primaryKey;column:user_id" json:"user_id"`
	DeviceID uint64 `gorm:"primaryKey;column:device_id" json:"device_id"`
}

type UserTaskCategory struct {
	UserID         uint64 `gorm:"primaryKey;column:user_id" json:"user_id"`
	TaskCategoryID uint64 `gorm:"primaryKey;column:task_category_id" json:"task_category_id"`
}

type Device struct {
	ID         uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID       uuid.UUID `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	DeviceName string    `gorm:"size:255;not null" json:"device_name"`
	Phone      string    `gorm:"size:50" json:"phone"`
	Status     string    `gorm:"size:50;default:'DISCONNECTED'" json:"status"`
	JID        string    `gorm:"size:255" json:"jid"`
	CreatedAt  time.Time `json:"created_at"`
}

func (d *Device) BeforeCreate(tx *gorm.DB) (err error) {
	if d.UUID == uuid.Nil {
		d.UUID = uuid.New()
	}
	return nil
}

type Message struct {
	ID          uint64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID        uuid.UUID  `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	DeviceID    uint64     `gorm:"not null" json:"device_id"`
	Device      Device     `gorm:"foreignKey:DeviceID;constraint:OnDelete:CASCADE" json:"-"`
	Direction   string     `gorm:"size:10;not null" json:"direction"` // IN or OUT
	Phone       string     `gorm:"size:50;not null" json:"phone"`
	Message     string     `gorm:"type:text;not null" json:"message"`
	Status      string     `gorm:"size:50;default:'PENDING'" json:"status"` // PENDING, SENT, DELIVERED, READ, FAILED
	SentAt      *time.Time `json:"sent_at,omitempty"`
	TaskID      *uint64    `json:"task_id,omitempty"`
	MessageType string     `gorm:"size:50;default:'text';not null" json:"message_type"`
	MediaURL    string     `gorm:"size:255" json:"media_url,omitempty"`
	FileName    string     `gorm:"size:255" json:"file_name,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (m *Message) BeforeCreate(tx *gorm.DB) (err error) {
	if m.UUID == uuid.Nil {
		m.UUID = uuid.New()
	}
	return nil
}

type Broadcast struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID      uuid.UUID `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	UserID    uint64    `gorm:"not null" json:"user_id"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	Title     string    `gorm:"size:255;not null" json:"title"`
	Message   string    `gorm:"type:text;not null" json:"message"`
	Status    string    `gorm:"size:50;default:'PENDING'" json:"status"` // PENDING, PROCESSING, COMPLETED, FAILED
	CreatedAt time.Time `json:"created_at"`
}

func (b *Broadcast) BeforeCreate(tx *gorm.DB) (err error) {
	if b.UUID == uuid.Nil {
		b.UUID = uuid.New()
	}
	return nil
}

type BroadcastDetail struct {
	ID          uint64     `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID        uuid.UUID  `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	BroadcastID uint64     `gorm:"not null" json:"broadcast_id"`
	Broadcast   Broadcast  `gorm:"foreignKey:BroadcastID;constraint:OnDelete:CASCADE" json:"-"`
	Phone       string     `gorm:"size:50;not null" json:"phone"`
	Status      string     `gorm:"size:50;default:'PENDING'" json:"status"` // PENDING, SENT, FAILED
	SentAt      *time.Time `json:"sent_at,omitempty"`
}

func (bd *BroadcastDetail) BeforeCreate(tx *gorm.DB) (err error) {
	if bd.UUID == uuid.Nil {
		bd.UUID = uuid.New()
	}
	return nil
}

type Contact struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID      uuid.UUID `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	UserID    uint64    `gorm:"not null;uniqueIndex:idx_user_phone" json:"user_id"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"-"`
	DeviceID  *uint64   `json:"device_id,omitempty"`
	Device    *Device   `gorm:"foreignKey:DeviceID;constraint:OnDelete:SET NULL" json:"device,omitempty"`
	Name      string    `gorm:"size:255;not null" json:"name"`
	Phone     string    `gorm:"size:50;not null;uniqueIndex:idx_user_phone" json:"phone"`
	Group     string    `gorm:"size:255" json:"group"`
	CreatedAt time.Time `json:"created_at"`
}

func (c *Contact) BeforeCreate(tx *gorm.DB) (err error) {
	if c.UUID == uuid.Nil {
		c.UUID = uuid.New()
	}
	return nil
}

type AutoReply struct {
	ID             uint64         `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID           uuid.UUID      `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	DeviceID       uint64         `gorm:"not null" json:"device_id"`
	Device         Device         `gorm:"foreignKey:DeviceID;constraint:OnDelete:CASCADE" json:"-"`
	Keyword        string         `gorm:"size:255;not null" json:"keyword"`
	MatchType      string         `gorm:"size:50;not null;default:'EXACT'" json:"match_type"` // EXACT, CONTAINS, START_WITH
	ReplyMessage   string         `gorm:"type:text;not null" json:"reply_message"`
	IsActive       bool           `gorm:"default:true" json:"is_active"`
	CreateTask     bool           `gorm:"default:false;not null" json:"create_task"`
	TaskCategoryID *uint64        `gorm:"index" json:"task_category_id,omitempty"`
	TaskCategory   *TaskCategory  `gorm:"foreignKey:TaskCategoryID;constraint:OnDelete:SET NULL" json:"task_category,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
}

func (ar *AutoReply) BeforeCreate(tx *gorm.DB) (err error) {
	if ar.UUID == uuid.Nil {
		ar.UUID = uuid.New()
	}
	return nil
}

type Role struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID        uuid.UUID `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	Name        string    `gorm:"size:50;uniqueIndex;not null" json:"name"`
	Description string    `gorm:"size:255" json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (r *Role) BeforeCreate(tx *gorm.DB) (err error) {
	if r.UUID == uuid.Nil {
		r.UUID = uuid.New()
	}
	return nil
}

type Menu struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Key       string    `gorm:"size:50;uniqueIndex;not null" json:"key"` // e.g. "dashboard", "devices"
	Path      string    `gorm:"size:255;not null" json:"path"`           // e.g. "/dashboard", "/devices"
	Icon      string    `gorm:"size:100" json:"icon"`
	ParentID  *uint64   `json:"parent_id"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type RoleMenuPermission struct {
	RoleID    uint64 `gorm:"primaryKey" json:"role_id"`
	MenuID    uint64 `gorm:"primaryKey" json:"menu_id"`
	CanCreate bool   `gorm:"default:false" json:"can_create"`
	CanRead   bool   `gorm:"default:false" json:"can_read"`
	CanUpdate bool   `gorm:"default:false" json:"can_update"`
	CanDelete bool   `gorm:"default:false" json:"can_delete"`
	Role      Role   `gorm:"foreignKey:RoleID;constraint:OnDelete:CASCADE" json:"-"`
	Menu      Menu   `gorm:"foreignKey:MenuID;constraint:OnDelete:CASCADE" json:"-"`
}

type Task struct {
	ID           uint64        `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID         uuid.UUID     `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	Number       string        `gorm:"size:20;uniqueIndex;default:generate_task_number()" json:"number"`
	DeviceID     uint64        `gorm:"not null" json:"device_id"`
	Device       Device        `gorm:"foreignKey:DeviceID;constraint:OnDelete:CASCADE" json:"device,omitempty"`
	Phone        string        `gorm:"size:255;not null" json:"phone"` // Stores full JID
	TriggerMsg   string        `gorm:"type:text;not null" json:"trigger_msg"`
	Status       string        `gorm:"size:50;default:'Open';not null" json:"status"` // Open, On Progress, On Hold, Closed
	CategoryID   *uint64       `gorm:"index" json:"category_id,omitempty"`
	Category     *TaskCategory `gorm:"foreignKey:CategoryID;constraint:OnDelete:SET NULL" json:"category,omitempty"`
	Description  string        `gorm:"type:text" json:"description"`
	UpdatedBy    string        `gorm:"size:255" json:"updated_by,omitempty"`
	PicName      string        `gorm:"-" json:"pic_name,omitempty"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
	ContactName  string        `gorm:"-" json:"contact_name,omitempty"`
	TaskMessages []TaskMessage `gorm:"foreignKey:TaskID;constraint:OnDelete:CASCADE" json:"task_messages,omitempty"`
	TaskLogs     []TaskLog     `gorm:"foreignKey:TaskID;constraint:OnDelete:CASCADE" json:"task_logs,omitempty"`
}

func (t *Task) BeforeCreate(tx *gorm.DB) (err error) {
	if t.UUID == uuid.Nil {
		t.UUID = uuid.New()
	}
	return nil
}

type TaskMessage struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	TaskID      uint64    `gorm:"not null;index" json:"task_id"`
	Direction   string    `gorm:"size:10;not null" json:"direction"` // IN or OUT
	Message     string    `gorm:"type:text;not null" json:"message"`
	MessageType string    `gorm:"size:50;default:'text';not null" json:"message_type"`
	MediaURL    string    `gorm:"size:255" json:"media_url,omitempty"`
	FileName    string    `gorm:"size:255" json:"file_name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type TaskLog struct {
	ID        uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	TaskID    uint64    `gorm:"not null;index" json:"task_id"`
	OldStatus string    `gorm:"size:50" json:"old_status"`
	NewStatus string    `gorm:"size:50;not null" json:"new_status"`
	UserID    uint64    `gorm:"not null" json:"user_id"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}
// TaskCategory is a global category label for support tasks
type TaskCategory struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	UUID        uuid.UUID `gorm:"type:uuid;uniqueIndex;default:uuid_generate_v4()" json:"uuid"`
	Name        string    `gorm:"size:100;uniqueIndex;not null" json:"name"`
	Description string    `gorm:"size:255" json:"description"`
	Color       string    `gorm:"size:20;default:'#6366f1'" json:"color"` // hex color for badge
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func (tc *TaskCategory) BeforeCreate(tx *gorm.DB) (err error) {
	if tc.UUID == uuid.Nil {
		tc.UUID = uuid.New()
	}
	return nil
}

