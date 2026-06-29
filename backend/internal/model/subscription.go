package model

import (
	"time"
)

type TierConfig struct {
	MaxDevices     int
	MaxMessages    int
	MaxAutoReplies int
	MaxUsers       int
	HasAPIKeys     bool
	HasWebhooks    bool
}

var Tiers = map[string]TierConfig{
	"free": {
		MaxDevices:     1,
		MaxMessages:    200,
		MaxAutoReplies: 3,
		MaxUsers:       1,
		HasAPIKeys:     false,
		HasWebhooks:    false,
	},
	"lite": {
		MaxDevices:     1,
		MaxMessages:    5000,
		MaxAutoReplies: 20,
		MaxUsers:       2,
		HasAPIKeys:     true,
		HasWebhooks:    false,
	},
	"regular": {
		MaxDevices:     3,
		MaxMessages:    50000,
		MaxAutoReplies: 999999, // Represents unlimited
		MaxUsers:       5,
		HasAPIKeys:     true,
		HasWebhooks:    true,
	},
	"pro": {
		MaxDevices:     10,
		MaxMessages:    500000, // FUP 500k
		MaxAutoReplies: 999999,
		MaxUsers:       999999,
		HasAPIKeys:     true,
		HasWebhooks:    true,
	},
}

func GetTierConfig(tier string) TierConfig {
	if cfg, ok := Tiers[tier]; ok {
		return cfg
	}
	return Tiers["free"]
}

func IsSubscriptionActive(u *User) bool {
	if u.SubscriptionTier == "free" || u.SubscriptionTier == "" {
		return true
	}
	if u.SubscriptionEndsAt != nil && time.Now().After(*u.SubscriptionEndsAt) {
		return false
	}
	return true
}
