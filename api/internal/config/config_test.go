package config

import (
	"strings"
	"testing"
	"time"
)

func env(overrides map[string]string) func(string) string {
	base := map[string]string{
		"DATABASE_URL":        "postgres://u:p@db:5432/mirror",
		"GITHUB_TOKEN":        "ghp_x",
		"APP_URL":             "http://localhost:3000",
		"AUTH_ENCRYPTION_KEY": "a2V5",
		"RESEND_API_KEY":      "re_x",
		"MAIL_FROM":           "Mirror <mirror@mail.example.com>",
		"ALLOWED_EMAILS":      " Me@Example.com , other@example.com,",
	}
	for k, v := range overrides {
		base[k] = v
	}
	return func(k string) string { return base[k] }
}

func TestDefaults(t *testing.T) {
	c, err := FromEnv(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.ListenAddr != ":8080" || c.OpsAddr != ":9090" || c.DataDir != "/data/repos" || c.SyncInterval != 6*time.Hour || c.AppName != "Cyberlab Mirror" || c.MaxFileSize != 1<<20 || c.SyncConcurrency != 2 {
		t.Errorf("defaults = %+v", c)
	}
	if strings.Join(c.AllowedEmails, ",") != "me@example.com,other@example.com" {
		t.Errorf("allowed emails = %v (want lowercased and trimmed)", c.AllowedEmails)
	}
	if len(c.TrustedProxies) != 2 {
		t.Errorf("trusted proxies = %v", c.TrustedProxies)
	}
}

func TestReportsEveryMissingSetting(t *testing.T) {
	_, err := FromEnv(func(string) string { return "" })
	if err == nil {
		t.Fatal("empty environment accepted")
	}
	for _, key := range []string{"DATABASE_URL", "GITHUB_TOKEN", "APP_URL", "AUTH_ENCRYPTION_KEY", "RESEND_API_KEY", "MAIL_FROM", "ALLOWED_EMAILS"} {
		if !strings.Contains(err.Error(), key) {
			t.Errorf("error doesn't mention %s: %v", key, err)
		}
	}
}

func TestInvalidSettings(t *testing.T) {
	cases := map[string]map[string]string{
		"interval too short":   {"SYNC_INTERVAL": "1m"},
		"interval unparsable":  {"SYNC_INTERVAL": "often"},
		"bad email":            {"ALLOWED_EMAILS": "not-an-email"},
		"display name email":   {"ALLOWED_EMAILS": "Me <me@example.com>"},
		"only commas":          {"ALLOWED_EMAILS": " , "},
		"bad proxy":            {"TRUSTED_PROXIES": "10.0.0.0/33"},
		"half of oauth":        {"GITHUB_OAUTH_CLIENT_ID": "Iv1.x"},
		"tiny max file":        {"MAX_FILE_SIZE": "10"},
		"no concurrency":       {"SYNC_CONCURRENCY": "0"},
		"too much concurrency": {"SYNC_CONCURRENCY": "9"},
	}
	for name, o := range cases {
		if _, err := FromEnv(env(o)); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}
