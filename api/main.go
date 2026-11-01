// Command api is cyberlab-mirror's backend: it mirrors GitHub repositories to
// disk and serves them read-only, behind the github.com/atlasopsec/auth
// module's sign-in and an email allowlist. Settings come from environment
// variables; see internal/config.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/atlasopsec/auth"
	"github.com/atlasopsec/auth/mail/resend"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"

	"github.com/jakefrenzel/cyberlab-mirror/api/internal/config"
	"github.com/jakefrenzel/cyberlab-mirror/api/internal/github"
	"github.com/jakefrenzel/cyberlab-mirror/api/internal/mirror"
	"github.com/jakefrenzel/cyberlab-mirror/api/internal/server"
)

// version is set at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, log); err != nil {
		log.Error("cyberlab-mirror api", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

func run(ctx context.Context, log *slog.Logger) error {
	cfg, err := config.FromEnv(os.Getenv)
	if err != nil {
		return err
	}
	log.Info("starting", slog.String("version", version), slog.Int("allowed_emails", len(cfg.AllowedEmails)))

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connecting to Postgres: %w", err)
	}
	defer pool.Close()
	migrateCtx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	if err := auth.Migrate(migrateCtx, pool); err != nil {
		return fmt.Errorf("migrating: %w", err)
	}

	allow := server.AllowUser(cfg.AllowedEmails)
	var oauth auth.OAuth
	if cfg.GitHubOAuthClientID != "" {
		oauth.GitHub = &auth.GitHub{ClientID: cfg.GitHubOAuthClientID, ClientSecret: cfg.GitHubOAuthClientSecret}
	}
	a, err := auth.New(auth.Config{
		DB:             pool,
		TrustedProxies: cfg.TrustedProxies,
		Logger:         log,
		Mailer:         resend.New(cfg.ResendAPIKey, cfg.MailFrom),
		AppURL:         cfg.AppURL,
		AppName:        cfg.AppName,
		EncryptionKey:  cfg.EncryptionKey,
		// No organizations: one owner, one allowlist
		DisableOrganizationCreation: true,
		OAuth:                       oauth,
		Hooks: auth.Hooks{
			// The second line of the allowlist, after the server's sign-up
			// gate: also covers signing up with GitHub
			OnUserCreated: func(_ context.Context, _ pgx.Tx, u auth.User) error {
				return allow(u.Email)
			},
		},
	})
	if err != nil {
		return err
	}

	reg := prometheus.NewRegistry()
	reg.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	buildInfo := prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "cyberlab_mirror_build_info",
		Help: "The running version.",
	}, []string{"version"})
	buildInfo.WithLabelValues(version).Set(1)
	reg.MustRegister(buildInfo)

	gh, err := github.New(github.DefaultBaseURL, cfg.GitHubToken)
	if err != nil {
		return err
	}
	m, err := mirror.New(gh, mirror.Options{
		Dir:         cfg.DataDir,
		Token:       cfg.GitHubToken,
		Interval:    cfg.SyncInterval,
		Concurrency: cfg.SyncConcurrency,
		Logger:      log,
		Metrics:     mirror.NewMetrics(reg),
	})
	if err != nil {
		return err
	}
	syncCtx, stopSync := context.WithCancel(ctx)
	defer stopSync()
	go m.Run(syncCtx)

	api := &http.Server{
		Addr: cfg.ListenAddr,
		Handler: server.New(server.Options{
			Guard:         a,
			Mirror:        m,
			AllowedEmails: cfg.AllowedEmails,
			MaxFileSize:   cfg.MaxFileSize,
			Logger:        log,
		}),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    64 << 10,
	}
	ops := &http.Server{
		Addr:              cfg.OpsAddr,
		Handler:           server.Ops(reg),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
	}

	errs := make(chan error, 2)
	for _, srv := range []*http.Server{api, ops} {
		go func() {
			log.Info("listening", slog.String("addr", srv.Addr))
			if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				errs <- fmt.Errorf("serving %s: %w", srv.Addr, err)
			}
		}()
	}

	var runErr error
	select {
	case runErr = <-errs:
	case <-ctx.Done():
		log.Info("shutting down")
	}
	stopSync()
	shutdown, cancelShutdown := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelShutdown()
	for _, srv := range []*http.Server{api, ops} {
		if err := srv.Shutdown(shutdown); err != nil {
			runErr = errors.Join(runErr, fmt.Errorf("shutting down %s: %w", srv.Addr, err))
		}
	}
	// Waits for emails still being sent
	if err := a.Close(shutdown); err != nil {
		runErr = errors.Join(runErr, err)
	}
	return runErr
}
