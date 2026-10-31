package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/atlasopsec/auth"
	"github.com/atlasopsec/auth/mail/mailtest"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// TestWithTheRealAuthModule runs the sign-in story against
// github.com/atlasopsec/auth and a real Postgres: a stranger can't sign up
// (and can't tell), an allowed address signs up, verifies, logs in, and
// browses, and losing its place on the allowlist locks it out. Needs Docker;
// skipped with -short.
func TestWithTheRealAuthModule(t *testing.T) {
	if testing.Short() {
		t.Skip("needs Docker")
	}
	testcontainers.SkipIfProviderIsNotHealthy(t)
	ctx := context.Background()

	pg, err := postgres.Run(ctx, "postgres:18.6-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5",
		postgres.WithDatabase("mirror"), postgres.WithUsername("mirror"), postgres.WithPassword("mirror"),
		testcontainers.WithWaitStrategy(wait.ForLog("database system is ready to accept connections").WithOccurrence(2).WithStartupTimeout(time.Minute)))
	testcontainers.CleanupContainer(t, pg)
	if err != nil {
		t.Fatal(err)
	}
	dsn, err := pg.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := auth.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}

	key := make([]byte, 32)
	_, _ = rand.Read(key)
	mails := &mailtest.Recorder{}
	allowed := []string{"me@example.com"}
	allow := AllowUser(allowed)
	a, err := auth.New(auth.Config{
		DB:                          pool,
		Mailer:                      mails,
		AppURL:                      "http://localhost:3000",
		AppName:                     "Cyberlab Mirror test",
		EncryptionKey:               base64.StdEncoding.EncodeToString(key),
		DisableBreachCheck:          true,
		DisableOrganizationCreation: true,
		DisableCleanup:              true,
		Hooks: auth.Hooks{OnUserCreated: func(_ context.Context, _ pgx.Tx, u auth.User) error {
			return allow(u.Email)
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = a.Close(context.Background()) })

	m := &fakeMirror{path: newRepoOnDisk(t)}
	h := New(Options{Guard: a, Mirror: m, AllowedEmails: allowed})
	call := func(h http.Handler, method, target, token, body string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequestWithContext(t.Context(), method, target, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	const password = "correct horse battery staple"

	// A stranger gets the same answer as a real sign-up, and nothing happens
	stranger := call(h, "POST", "/v1/users", "", `{"email":"stranger@example.com","password":"`+password+`","client":"web"}`)
	allowedSignUp := call(h, "POST", "/v1/users", "", `{"email":"me@example.com","password":"`+password+`","client":"web"}`)
	if stranger.Code != http.StatusAccepted || allowedSignUp.Code != http.StatusAccepted || stranger.Body.String() != allowedSignUp.Body.String() {
		t.Fatalf("sign-ups differ: stranger %d %q, allowed %d %q", stranger.Code, stranger.Body, allowedSignUp.Code, allowedSignUp.Body)
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth.users`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("users = %d (%v), want only the allowed one", count, err)
	}

	// Without the gate, the module's hook still refuses the stranger
	direct := http.NewServeMux()
	a.Register(direct)
	if rec := call(direct, "POST", "/v1/users", "", `{"email":"other@example.com","password":"`+password+`","client":"web"}`); rec.Code != http.StatusInternalServerError {
		t.Errorf("hook didn't refuse: %d %s", rec.Code, rec.Body)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth.users`).Scan(&count); err != nil || count != 1 {
		t.Errorf("users = %d after the hook refused, want 1", count)
	}

	// Verify from the emailed link, which logs in
	msgs := mails.Messages()
	if len(msgs) != 1 || msgs[0].To != "me@example.com" {
		t.Fatalf("emails = %+v, want one to me@example.com", msgs)
	}
	match := regexp.MustCompile(`/verify-email#token=([A-Za-z0-9_-]+)`).FindStringSubmatch(msgs[0].Text)
	if match == nil {
		t.Fatalf("no verification link in: %s", msgs[0].Text)
	}
	if rec := call(h, "POST", "/v1/sessions", "", `{"email":"me@example.com","password":"`+password+`","client":"web"}`); rec.Code == http.StatusOK {
		t.Error("logged in before verifying")
	}
	rec := call(h, "POST", "/v1/email-verifications/confirm", "", `{"token":"`+match[1]+`","password":"`+password+`","client":"web"}`)
	var login struct {
		Token string `json:"token"`
	}
	if rec.Code != http.StatusCreated || json.Unmarshal(rec.Body.Bytes(), &login) != nil || login.Token == "" {
		t.Fatalf("verification: %d %s", rec.Code, rec.Body)
	}

	// Signed in and allowed: the mirror opens
	if rec := call(h, "GET", "/v1/repos", login.Token, ""); rec.Code != http.StatusOK {
		t.Fatalf("repos with a session: %d %s", rec.Code, rec.Body)
	}
	if rec := call(h, "GET", "/v1/repos/one/blob?path=README.md", login.Token, ""); rec.Code != http.StatusOK {
		t.Errorf("blob with a session: %d %s", rec.Code, rec.Body)
	}
	rec = call(h, "GET", "/v1/repos", "not-a-real-token", "")
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("bad token: %d", rec.Code)
	}
	// The module's errors carry the request ID the server set
	var body errorBody
	if json.Unmarshal(rec.Body.Bytes(), &body) != nil || body.Error.RequestID == "" || body.Error.RequestID != rec.Header().Get("X-Request-ID") {
		t.Errorf("request IDs don't line up: body %q, header %q", body.Error.RequestID, rec.Header().Get("X-Request-ID"))
	}

	// Taken off the allowlist: the same session no longer opens the mirror
	revoked := New(Options{Guard: a, Mirror: m, AllowedEmails: []string{"someone-else@example.com"}})
	if rec := call(revoked, "GET", "/v1/repos", login.Token, ""); rec.Code != http.StatusForbidden {
		t.Errorf("after removal from the allowlist: %d", rec.Code)
	}

	// Logging out ends the session
	if rec := call(h, "DELETE", "/v1/sessions/current", login.Token, ""); rec.Code/100 != 2 {
		t.Fatalf("logout: %d %s", rec.Code, rec.Body)
	}
	if rec := call(h, "GET", "/v1/repos", login.Token, ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("after logout: %d", rec.Code)
	}
}
