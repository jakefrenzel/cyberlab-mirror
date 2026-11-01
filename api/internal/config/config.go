// Package config reads the API's settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/mail"
	"net/netip"
	"strings"
	"time"
)

// Config is the API's configuration.
type Config struct {
	// DatabaseURL is the Postgres connection string (DATABASE_URL).
	DatabaseURL string
	// ListenAddr serves the API (LISTEN_ADDR, default :8080).
	ListenAddr string
	// OpsAddr serves /healthz and /metrics (OPS_ADDR, default :9090), kept
	// apart so the web app, which reaches the API, can't reach the metrics.
	OpsAddr string
	// DataDir holds the repository copies (DATA_DIR, default /data/repos).
	DataDir string
	// GitHubToken reads the repositories (GITHUB_TOKEN): a fine-grained token
	// with read-only Contents and Metadata.
	GitHubToken string
	// SyncInterval is the time between syncs (SYNC_INTERVAL, default 6h,
	// at least 5m).
	SyncInterval time.Duration
	// AppURL is the web app's URL, for links in emails (APP_URL).
	AppURL string
	// AppName appears in emails (APP_NAME, default "Cyberlab Mirror").
	AppName string
	// EncryptionKey encrypts 2FA secrets (AUTH_ENCRYPTION_KEY).
	EncryptionKey string
	// ResendAPIKey and MailFrom send the auth emails (RESEND_API_KEY,
	// MAIL_FROM, e.g. "Cyberlab Mirror <mirror@mail.example.com>").
	ResendAPIKey string
	MailFrom     string
	// AllowedEmails may sign up and use the mirror (ALLOWED_EMAILS,
	// comma-separated). Required: without it nobody could sign in.
	AllowedEmails []string
	// TrustedProxies may forward the client's IP (TRUSTED_PROXIES,
	// comma-separated CIDRs, default loopback): the web app's pods.
	TrustedProxies []netip.Prefix
	// GitHubOAuthClientID and GitHubOAuthClientSecret turn on "Sign in with
	// GitHub" when both are set (GITHUB_OAUTH_CLIENT_ID,
	// GITHUB_OAUTH_CLIENT_SECRET).
	GitHubOAuthClientID     string
	GitHubOAuthClientSecret string
	// MaxFileSize is the largest file whose content the API returns
	// (MAX_FILE_SIZE bytes, default 1 MiB).
	MaxFileSize int64
	// SyncConcurrency is how many repositories sync at once
	// (SYNC_CONCURRENCY, 1 to 8, default 2). Each costs memory while it runs.
	SyncConcurrency int
}

// FromEnv reads the configuration through getenv (os.Getenv in production).
// It reports every problem at once.
func FromEnv(getenv func(string) string) (Config, error) {
	var errs []error
	get := func(key, fallback string) string {
		if v := strings.TrimSpace(getenv(key)); v != "" {
			return v
		}
		return fallback
	}
	required := func(key string) string {
		v := strings.TrimSpace(getenv(key))
		if v == "" {
			errs = append(errs, fmt.Errorf("%s is required", key))
		}
		return v
	}

	c := Config{
		DatabaseURL:             required("DATABASE_URL"),
		ListenAddr:              get("LISTEN_ADDR", ":8080"),
		OpsAddr:                 get("OPS_ADDR", ":9090"),
		DataDir:                 get("DATA_DIR", "/data/repos"),
		GitHubToken:             required("GITHUB_TOKEN"),
		AppURL:                  required("APP_URL"),
		AppName:                 get("APP_NAME", "Cyberlab Mirror"),
		EncryptionKey:           required("AUTH_ENCRYPTION_KEY"),
		ResendAPIKey:            required("RESEND_API_KEY"),
		MailFrom:                required("MAIL_FROM"),
		GitHubOAuthClientID:     get("GITHUB_OAUTH_CLIENT_ID", ""),
		GitHubOAuthClientSecret: get("GITHUB_OAUTH_CLIENT_SECRET", ""),
	}

	interval, err := time.ParseDuration(get("SYNC_INTERVAL", "6h"))
	switch {
	case err != nil:
		errs = append(errs, fmt.Errorf("SYNC_INTERVAL: %w", err))
	case interval < 5*time.Minute:
		errs = append(errs, errors.New("SYNC_INTERVAL must be at least 5m"))
	}
	c.SyncInterval = interval

	if v := required("ALLOWED_EMAILS"); v != "" {
		for _, e := range strings.Split(v, ",") {
			e = strings.ToLower(strings.TrimSpace(e))
			if e == "" {
				continue
			}
			if addr, err := mail.ParseAddress(e); err != nil || addr.Address != e {
				errs = append(errs, fmt.Errorf("ALLOWED_EMAILS: %q isn't an email address", e))
				continue
			}
			c.AllowedEmails = append(c.AllowedEmails, e)
		}
		if len(c.AllowedEmails) == 0 {
			errs = append(errs, errors.New("ALLOWED_EMAILS has no addresses"))
		}
	}

	for _, s := range strings.Split(get("TRUSTED_PROXIES", "127.0.0.0/8,::1/128"), ",") {
		p, err := netip.ParsePrefix(strings.TrimSpace(s))
		if err != nil {
			errs = append(errs, fmt.Errorf("TRUSTED_PROXIES: %w", err))
			continue
		}
		c.TrustedProxies = append(c.TrustedProxies, p)
	}

	if (c.GitHubOAuthClientID == "") != (c.GitHubOAuthClientSecret == "") {
		errs = append(errs, errors.New("GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET must be set together"))
	}

	c.MaxFileSize = 1 << 20
	if v := get("MAX_FILE_SIZE", ""); v != "" {
		var n int64
		if _, err := fmt.Sscan(v, &n); err != nil || n < 1024 || n > 16<<20 {
			errs = append(errs, errors.New("MAX_FILE_SIZE must be between 1024 and 16777216 bytes"))
		}
		c.MaxFileSize = n
	}

	c.SyncConcurrency = 2
	if v := get("SYNC_CONCURRENCY", ""); v != "" {
		var n int
		if _, err := fmt.Sscan(v, &n); err != nil || n < 1 || n > 8 {
			errs = append(errs, errors.New("SYNC_CONCURRENCY must be from 1 to 8"))
		}
		c.SyncConcurrency = n
	}

	if len(errs) > 0 {
		return Config{}, fmt.Errorf("config: %w", errors.Join(errs...))
	}
	return c, nil
}
