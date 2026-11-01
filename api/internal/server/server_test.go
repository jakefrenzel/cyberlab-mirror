package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/jakefrenzel/cyberlab-mirror/api/internal/mirror"
)

type emailKey struct{}

type guarded struct{ http.Handler }

// fakeGuard stands in for *auth.Auth: "Authorization: Bearer <email>" is a
// valid session for that address, and Protect refuses unguarded routes as
// the module does.
type fakeGuard struct {
	signUps  atomic.Int32
	lastBody atomic.Value
}

func (g *fakeGuard) Register(mux *http.ServeMux) {
	mux.Handle("POST /v1/users", g.Public(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g.signUps.Add(1)
		b, _ := io.ReadAll(r.Body)
		g.lastBody.Store(string(b))
		w.WriteHeader(http.StatusAccepted)
		_, _ = io.WriteString(w, `{"verification_required":true}`)
	})))
}

func (g *fakeGuard) Authenticated(h http.Handler) http.Handler {
	return guarded{http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || email == "" {
			writeError(w, http.StatusUnauthorized, "unauthenticated", "Log in.")
			return
		}
		h.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), emailKey{}, email)))
	})}
}

func (g *fakeGuard) Public(h http.Handler) http.Handler { return guarded{h} }

func (g *fakeGuard) Protect(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, pattern := mux.Handler(r)
		if _, ok := h.(guarded); !ok && pattern != "" {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

// fakeMirror serves one repository on disk ("one") and one known but not
// copied yet ("pending").
type fakeMirror struct {
	path         string
	triggers     atomic.Int32
	repoTriggers atomic.Int32
	lastRepo     atomic.Value
}

func (m *fakeMirror) List() []mirror.Status {
	one, _ := m.Get("one")
	pending, _ := m.Get("pending")
	return []mirror.Status{one, pending}
}

func (m *fakeMirror) Get(name string) (mirror.Status, bool) {
	switch name {
	case "one":
		return mirror.Status{Name: "one", FullName: "me/one", DefaultBranch: "master", Private: true, State: mirror.StateOK, OnDisk: true, LastSuccess: time.Unix(1_700_000_000, 0), SizeBytes: 123}, true
	case "pending":
		return mirror.Status{Name: "pending", State: mirror.StatePending}, true
	}
	return mirror.Status{}, false
}

func (m *fakeMirror) Read(name string, fn func(string) error) error {
	switch name {
	case "one":
		return fn(m.path)
	case "pending":
		return mirror.ErrNotMirrored
	}
	return mirror.ErrNotFound
}

func (m *fakeMirror) Trigger() bool { return m.triggers.Add(1) == 1 }
func (m *fakeMirror) Syncing() bool { return false }

// TriggerRepo knows "one" (listed) and "pending" (not listed yet).
func (m *fakeMirror) TriggerRepo(name string) (bool, error) {
	switch name {
	case "one":
		m.lastRepo.Store(name)
		return m.repoTriggers.Add(1) == 1, nil
	case "pending":
		return false, mirror.ErrNotListed
	}
	return false, mirror.ErrNotFound
}

func (m *fakeMirror) Schedule() (last, next time.Time) {
	return time.Unix(1_700_000_000, 0), time.Time{}
}

func newRepoOnDisk(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	r, err := git.PlainInit(dir, false)
	if err != nil {
		t.Fatal(err)
	}
	wt, _ := r.Worktree()
	files := map[string]string{"README.md": "<script>alert(1)</script>\n", "src/app.go": "package app\n"}
	for p, c := range files {
		full := filepath.Join(dir, filepath.FromSlash(p))
		_ = os.MkdirAll(filepath.Dir(full), 0o750)
		if err := os.WriteFile(full, []byte(c), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := wt.Add(p); err != nil {
			t.Fatal(err)
		}
	}
	for i := range 35 {
		_, err := wt.Commit("commit "+string(rune('a'+i%26)), &git.CommitOptions{
			AllowEmptyCommits: true,
			Author:            &object.Signature{Name: "Ada", Email: "ada@example.com", When: time.Unix(1_700_000_000+int64(i)*60, 0)},
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

type harness struct {
	t      *testing.T
	h      http.Handler
	guard  *fakeGuard
	mirror *fakeMirror
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	g := &fakeGuard{}
	m := &fakeMirror{path: newRepoOnDisk(t)}
	h := New(Options{
		Guard:         g,
		Mirror:        m,
		AllowedEmails: []string{"me@example.com"},
		UserEmail: func(ctx context.Context) (string, bool) {
			e, ok := ctx.Value(emailKey{}).(string)
			return e, ok
		},
	})
	return &harness{t: t, h: h, guard: g, mirror: m}
}

func (h *harness) do(method, target, as, body string) *httptest.ResponseRecorder {
	h.t.Helper()
	req := httptest.NewRequestWithContext(h.t.Context(), method, target, strings.NewReader(body))
	if as != "" {
		req.Header.Set("Authorization", "Bearer "+as)
	}
	rec := httptest.NewRecorder()
	h.h.ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var v map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("response isn't JSON: %v\n%s", err, rec.Body)
	}
	return v
}

func errCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	e, _ := decode(t, rec)["error"].(map[string]any)
	if e == nil {
		t.Fatalf("no error object in %s", rec.Body)
	}
	if e["request_id"] != rec.Header().Get("X-Request-ID") || e["request_id"] == "" {
		t.Errorf("request_id %v doesn't match header %q", e["request_id"], rec.Header().Get("X-Request-ID"))
	}
	return e["code"].(string)
}

const me = "ME@Example.com" // allowlisted, in another case

func TestSignInAndAllowlist(t *testing.T) {
	h := newHarness(t)
	if rec := h.do("GET", "/v1/repos", "", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("no session: %d", rec.Code)
	}
	rec := h.do("GET", "/v1/repos", "stranger@example.com", "")
	if rec.Code != http.StatusForbidden || errCode(t, rec) != "forbidden" {
		t.Errorf("not allowlisted: %d %s", rec.Code, rec.Body)
	}
	for _, target := range []string{"/v1/repos/one", "/v1/repos/one/tree", "/v1/repos/one/blob?path=README.md", "/v1/repos/one/commits"} {
		if rec := h.do("GET", target, "stranger@example.com", ""); rec.Code != http.StatusForbidden {
			t.Errorf("%s as a stranger: %d", target, rec.Code)
		}
	}
	if rec := h.do("POST", "/v1/syncs", "stranger@example.com", ""); rec.Code != http.StatusForbidden || h.mirror.triggers.Load() != 0 {
		t.Errorf("stranger triggered a sync: %d", rec.Code)
	}
}

func TestListAndGetRepos(t *testing.T) {
	h := newHarness(t)
	rec := h.do("GET", "/v1/repos", me, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	repos := decode(t, rec)["repositories"].([]any)
	one := repos[0].(map[string]any)
	if len(repos) != 2 || one["name"] != "one" || one["state"] != "ok" || one["private"] != true || one["last_success_at"] != "2023-11-14T22:13:20Z" || one["pushed_at"] != nil {
		t.Errorf("repositories = %v", repos)
	}
	if body := decode(t, h.do("GET", "/v1/repos", me, "")); body["last_run_at"] != "2023-11-14T22:13:20Z" || body["next_run_at"] != nil {
		t.Errorf("schedule: last %v, next %v", body["last_run_at"], body["next_run_at"])
	}

	rec = h.do("GET", "/v1/repos/one", me, "")
	refs, _ := decode(t, rec)["refs"].(map[string]any)
	if rec.Code != http.StatusOK || refs == nil || refs["head"] != "master" {
		t.Errorf("get one: %d %s", rec.Code, rec.Body)
	}
	rec = h.do("GET", "/v1/repos/pending", me, "")
	if rec.Code != http.StatusOK || decode(t, rec)["refs"] != nil {
		t.Errorf("get pending: %d %s", rec.Code, rec.Body)
	}
	for _, name := range []string{"missing", "a%2Fb", "..%2F..", strings.Repeat("x", 101)} {
		if rec := h.do("GET", "/v1/repos/"+name, me, ""); rec.Code != http.StatusNotFound {
			t.Errorf("repo %q: %d", name, rec.Code)
		}
	}
	// A literal ".." never reaches a handler: the router redirects to the
	// cleaned path, which is still behind sign-in
	if rec := h.do("GET", "/v1/repos/..", me, ""); rec.Code != http.StatusTemporaryRedirect || rec.Header().Get("Location") != "/v1" {
		t.Errorf(`repo "..": %d to %q`, rec.Code, rec.Header().Get("Location"))
	}
}

func TestBrowsing(t *testing.T) {
	h := newHarness(t)
	rec := h.do("GET", "/v1/repos/one/tree", me, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("tree: %d %s", rec.Code, rec.Body)
	}
	entries := decode(t, rec)["entries"].([]any)
	if len(entries) != 2 || entries[0].(map[string]any)["name"] != "src" {
		t.Errorf("entries = %v", entries)
	}

	rec = h.do("GET", "/v1/repos/one/blob?path=README.md", me, "")
	file, _ := decode(t, rec)["file"].(map[string]any)
	if rec.Code != http.StatusOK || file["content"] != "<script>alert(1)</script>\n" {
		t.Fatalf("blob: %d %s", rec.Code, rec.Body)
	}
	// File contents only ever travel as a JSON string, never as a page
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q", ct)
	}
	if strings.Contains(rec.Body.String(), "<script>") {
		t.Error("markup isn't escaped in the JSON body")
	}

	cases := []struct {
		target string
		status int
		code   string
	}{
		{"/v1/repos/one/blob?path=../../etc/passwd", 400, "invalid_path"},
		{"/v1/repos/one/blob?path=src%2F..%2F..%2Fx", 400, "invalid_path"},
		{"/v1/repos/one/tree?path=..", 400, "invalid_path"},
		{"/v1/repos/one/blob?path=README.md&ref=master~1", 400, "invalid_ref"},
		{"/v1/repos/one/blob?path=src", 400, "not_a_file"},
		{"/v1/repos/one/tree?path=README.md", 400, "not_a_directory"},
		{"/v1/repos/one/blob?path=missing.txt", 404, "not_found"},
		{"/v1/repos/one/blob?path=README.md&ref=no-such-branch", 404, "not_found"},
		{"/v1/repos/pending/tree", 409, "not_mirrored"},
		{"/v1/repos/missing/tree", 404, "not_found"},
		{"/v1/repos/one/commits?page=0", 400, "invalid_page"},
		{"/v1/repos/one/commits?page=x", 400, "invalid_page"},
	}
	for _, c := range cases {
		rec := h.do("GET", c.target, me, "")
		if rec.Code != c.status || errCode(t, rec) != c.code {
			t.Errorf("%s: %d %s, want %d %s", c.target, rec.Code, rec.Body, c.status, c.code)
		}
	}
}

func TestCommitPages(t *testing.T) {
	h := newHarness(t)
	rec := h.do("GET", "/v1/repos/one/commits", me, "")
	body := decode(t, rec)
	if rec.Code != http.StatusOK || len(body["commits"].([]any)) != perPage || body["next_page"] != float64(2) {
		t.Fatalf("page 1: %d, %d commits, next %v", rec.Code, len(body["commits"].([]any)), body["next_page"])
	}
	body = decode(t, h.do("GET", "/v1/repos/one/commits?page=2", me, ""))
	if len(body["commits"].([]any)) != 5 || body["next_page"] != nil {
		t.Errorf("page 2: %d commits, next %v", len(body["commits"].([]any)), body["next_page"])
	}
	body = decode(t, h.do("GET", "/v1/repos/one/commits?page=9", me, ""))
	if commits, ok := body["commits"].([]any); !ok || len(commits) != 0 {
		t.Errorf("past the end: %v (want an empty list, not null)", body["commits"])
	}
}

func TestStartSync(t *testing.T) {
	h := newHarness(t)
	rec := h.do("POST", "/v1/syncs", me, "")
	if rec.Code != http.StatusAccepted || decode(t, rec)["queued"] != true {
		t.Errorf("first: %d %s", rec.Code, rec.Body)
	}
	if rec := h.do("POST", "/v1/syncs", me, ""); decode(t, rec)["queued"] != false {
		t.Errorf("second should report already queued: %s", rec.Body)
	}
}

func TestSyncOneRepository(t *testing.T) {
	h := newHarness(t)
	rec := h.do("POST", "/v1/syncs", me, `{"repository":"one"}`)
	if rec.Code != http.StatusAccepted || decode(t, rec)["queued"] != true || h.mirror.lastRepo.Load() != "one" {
		t.Errorf("first: %d %s", rec.Code, rec.Body)
	}
	if rec := h.do("POST", "/v1/syncs", me, `{"repository":"one"}`); decode(t, rec)["queued"] != false {
		t.Errorf("second should report already queued: %s", rec.Body)
	}
	if h.mirror.triggers.Load() != 0 {
		t.Error("a single repository's sync started a full one")
	}
	for body, want := range map[string]struct {
		status int
		code   string
	}{
		`{"repository":"pending"}`:                           {http.StatusConflict, "not_listed"},
		`{"repository":"missing"}`:                           {http.StatusNotFound, "not_found"},
		`{"repository":"../etc"}`:                            {http.StatusNotFound, "not_found"},
		`{"repository":""}`:                                  {http.StatusBadRequest, "invalid_request"},
		`{"repository":"one","force":true}`:                  {http.StatusBadRequest, "invalid_request"},
		`not json`:                                           {http.StatusBadRequest, "invalid_request"},
		`{"repository":"` + strings.Repeat("x", 2000) + `"}`: {http.StatusRequestEntityTooLarge, "request_too_large"},
	} {
		rec := h.do("POST", "/v1/syncs", me, body)
		if rec.Code != want.status || errCode(t, rec) != want.code {
			t.Errorf("%.40s: %d %s", body, rec.Code, rec.Body)
		}
	}
	if rec := h.do("POST", "/v1/syncs", "stranger@example.com", `{"repository":"one"}`); rec.Code != http.StatusForbidden {
		t.Errorf("not allowlisted: %d", rec.Code)
	}
}

func TestFileList(t *testing.T) {
	h := newHarness(t)
	rec := h.do("GET", "/v1/repos/one/files", me, "")
	body := decode(t, rec)
	files, _ := body["files"].([]any)
	if rec.Code != http.StatusOK || len(files) != 2 || files[0] != "README.md" || files[1] != "src/app.go" || body["truncated"] != false || len(body["commit"].(string)) != 40 {
		t.Errorf("files: %d %s", rec.Code, rec.Body)
	}
	for target, want := range map[string]int{
		"/v1/repos/one/files?ref=nope":   http.StatusNotFound,
		"/v1/repos/one/files?ref=..%2Fx": http.StatusBadRequest,
		"/v1/repos/pending/files":        http.StatusConflict,
		"/v1/repos/missing/files":        http.StatusNotFound,
	} {
		if rec := h.do("GET", target, me, ""); rec.Code != want {
			t.Errorf("%s: %d, want %d", target, rec.Code, want)
		}
	}
	if rec := h.do("GET", "/v1/repos/one/files", "", ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("no session: %d", rec.Code)
	}
}

func TestSignUpGate(t *testing.T) {
	h := newHarness(t)

	rec := h.do("POST", "/v1/users", "", `{"email":"stranger@example.com","password":"long enough password","client":"web"}`)
	if rec.Code != http.StatusAccepted || rec.Body.String() != "{\"verification_required\":true}\n" {
		t.Errorf("stranger: %d %q (want the module's exact 202)", rec.Code, rec.Body)
	}
	if h.guard.signUps.Load() != 0 {
		t.Error("a stranger's sign-up reached the auth module")
	}

	body := `{"email":" Me@Example.com ","password":"long enough password","client":"web"}`
	if rec := h.do("POST", "/v1/users", "", body); rec.Code != http.StatusAccepted || h.guard.signUps.Load() != 1 {
		t.Fatalf("allowlisted: %d, module calls %d", rec.Code, h.guard.signUps.Load())
	}
	if got := h.guard.lastBody.Load(); got != body {
		t.Errorf("body changed on the way through: %q", got)
	}

	// Malformed requests go to the module, for its own validation errors
	for _, b := range []string{`not json`, `{"email":"not-an-email"}`, `{"email":""}`, `{"email":"Me <x@example.com>"}`} {
		before := h.guard.signUps.Load()
		h.do("POST", "/v1/users", "", b)
		if h.guard.signUps.Load() != before+1 {
			t.Errorf("%s didn't reach the module", b)
		}
	}

	rec = h.do("POST", "/v1/users", "", `{"email":"`+strings.Repeat("a", maxSignUpBody)+`@example.com"}`)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("oversized: %d", rec.Code)
	}
}

func TestAllowUser(t *testing.T) {
	check := AllowUser([]string{"me@example.com"})
	if err := check("  ME@example.COM "); err != nil {
		t.Errorf("allowed address refused: %v", err)
	}
	if err := check("other@example.com"); err == nil {
		t.Error("other address allowed")
	}
}

func TestHeadersAndRequestID(t *testing.T) {
	h := newHarness(t)
	rec := h.do("GET", "/v1/repos", me, "")
	for k, want := range map[string]string{
		"X-Content-Type-Options":  "nosniff",
		"Cache-Control":           "no-store",
		"Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
		"Referrer-Policy":         "no-referrer",
	} {
		if got := rec.Header().Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
	if len(rec.Header().Get("X-Request-ID")) != 32 {
		t.Errorf("generated request ID = %q", rec.Header().Get("X-Request-ID"))
	}

	req := httptest.NewRequestWithContext(t.Context(), "GET", "/v1/repos", nil)
	req.Header.Set("X-Request-ID", "from-web-123")
	rec = httptest.NewRecorder()
	h.h.ServeHTTP(rec, req)
	if rec.Header().Get("X-Request-ID") != "from-web-123" {
		t.Errorf("incoming ID not kept: %q", rec.Header().Get("X-Request-ID"))
	}
	req.Header.Set("X-Request-ID", "bad id\nwith newline")
	rec = httptest.NewRecorder()
	h.h.ServeHTTP(rec, req)
	if strings.Contains(rec.Header().Get("X-Request-ID"), " ") {
		t.Errorf("malformed incoming ID kept: %q", rec.Header().Get("X-Request-ID"))
	}
}

func TestOps(t *testing.T) {
	reg := prometheus.NewRegistry()
	mirror.NewMetrics(reg)
	h := Ops(reg)
	for _, p := range []string{"/healthz", "/metrics"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), "GET", p, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("%s: %d", p, rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), "GET", "/v1/repos", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("the API is reachable on the ops port: %d", rec.Code)
	}
}

func TestOpsRoutesArentOnTheAPI(t *testing.T) {
	h := newHarness(t)
	for _, p := range []string{"/metrics", "/healthz"} {
		if rec := h.do("GET", p, me, ""); rec.Code != http.StatusNotFound {
			t.Errorf("%s on the API port: %d, want 404", p, rec.Code)
		}
	}
}
