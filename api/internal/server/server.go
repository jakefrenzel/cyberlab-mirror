// Package server is the API's HTTP layer: the auth module's endpoints, the
// mirror's read-only endpoints behind a sign-in and an email allowlist, and a
// separate handler for health checks and metrics.
package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/atlasopsec/auth"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/jakefrenzel/cyberlab-mirror/api/internal/browse"
	"github.com/jakefrenzel/cyberlab-mirror/api/internal/mirror"
)

// Guard is the part of *auth.Auth the server uses.
type Guard interface {
	Register(mux *http.ServeMux)
	Authenticated(h http.Handler) http.Handler
	Public(h http.Handler) http.Handler
	Protect(mux *http.ServeMux) http.Handler
}

// Mirror is the part of *mirror.Manager the server uses.
type Mirror interface {
	List() []mirror.Status
	Get(name string) (mirror.Status, bool)
	Read(name string, fn func(path string) error) error
	Trigger() bool
	TriggerRepo(name string) (bool, error)
	Syncing() bool
	Schedule() (last, next time.Time)
}

// Options configures the API handler.
type Options struct {
	Guard  Guard
	Mirror Mirror
	// AllowedEmails may sign up and use the mirror, lowercased.
	AllowedEmails []string
	// UserEmail returns the logged-in user's email. Default: auth.UserFrom.
	UserEmail func(ctx context.Context) (string, bool)
	// MaxFileSize is the largest file whose content is returned.
	MaxFileSize int64
	Logger      *slog.Logger
}

// perPage is the number of commits per page of history.
const perPage = 30

// maxFiles bounds the file list for searching by name.
const maxFiles = 10000

// maxSyncBody bounds POST /v1/syncs, whose body is at most a repository name.
const maxSyncBody = 1 << 10

// maxSignUpBody matches the auth module's own request size limit.
const maxSignUpBody = 64 << 10

var validRepoName = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)

type server struct {
	opts    Options
	allowed map[string]bool
	log     *slog.Logger
}

// New returns the API handler. Every route goes through the auth module's
// Protect, which refuses any route without an access rule.
func New(opts Options) http.Handler {
	if opts.UserEmail == nil {
		opts.UserEmail = func(ctx context.Context) (string, bool) {
			u, ok := auth.UserFrom(ctx)
			return u.Email, ok
		}
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.MaxFileSize <= 0 {
		opts.MaxFileSize = 1 << 20
	}
	s := &server{opts: opts, allowed: map[string]bool{}, log: opts.Logger}
	for _, e := range opts.AllowedEmails {
		s.allowed[strings.ToLower(strings.TrimSpace(e))] = true
	}

	mux := http.NewServeMux()
	opts.Guard.Register(mux)
	member := func(h http.HandlerFunc) http.Handler {
		return opts.Guard.Authenticated(s.allowlisted(h))
	}
	mux.Handle("GET /v1/repos", member(s.listRepos))
	mux.Handle("GET /v1/repos/{name}", member(s.getRepo))
	mux.Handle("GET /v1/repos/{name}/tree", member(s.tree))
	mux.Handle("GET /v1/repos/{name}/blob", member(s.blob))
	mux.Handle("GET /v1/repos/{name}/commits", member(s.commits))
	mux.Handle("GET /v1/repos/{name}/files", member(s.files))
	mux.Handle("POST /v1/syncs", member(s.startSync))

	return securityHeaders(withRequestID(s.signUpGate(opts.Guard.Protect(mux))))
}

// Ops returns the handler for health checks and metrics, served on its own
// port.
func Ops(reg *prometheus.Registry) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = io.WriteString(w, "ok\n")
	})
	mux.Handle("GET /metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
	return mux
}

// securityHeaders sets headers for a JSON API that's never rendered: no
// sniffing, no caching, no framing, nothing loaded.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "no-store")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)

// withRequestID gives every response an X-Request-ID before the auth module
// sees it; the module reuses an ID already on the response, so its errors
// and the mirror's share one ID. A well-formed incoming ID (from the web
// app) is kept, to follow a request across both.
func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if !validRequestID.MatchString(id) {
			b := make([]byte, 16)
			_, _ = rand.Read(b)
			id = hex.EncodeToString(b)
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r)
	})
}

// signUpGate answers sign-ups for addresses that aren't on the allowlist
// exactly as the auth module answers a real one (202, "check your email"),
// without creating anything. The module's OnUserCreated hook also refuses
// them, but a refusal there becomes a 500, which would tell anyone which
// addresses are allowed. Malformed requests go through, so the module's own
// validation errors are unchanged.
func (s *server) signUpGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/users" {
			next.ServeHTTP(w, r)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxSignUpBody))
		if err != nil {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request is too large.")
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))

		var req struct {
			Email string `json:"email"`
		}
		if json.Unmarshal(body, &req) != nil {
			next.ServeHTTP(w, r)
			return
		}
		email := strings.TrimSpace(req.Email)
		if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email {
			next.ServeHTTP(w, r)
			return
		}
		if s.allowed[strings.ToLower(email)] {
			next.ServeHTTP(w, r)
			return
		}
		s.log.InfoContext(r.Context(), "sign-up refused: address not on the allowlist",
			slog.String("request_id", w.Header().Get("X-Request-ID")))
		writeJSON(w, http.StatusAccepted, map[string]bool{"verification_required": true})
	})
}

// AllowUser is the auth module's OnUserCreated check: it refuses accounts
// for addresses that aren't allowed, for every way of signing up (password
// and GitHub). It returns an error for anything not on the list.
func AllowUser(allowed []string) func(email string) error {
	set := map[string]bool{}
	for _, e := range allowed {
		set[strings.ToLower(strings.TrimSpace(e))] = true
	}
	return func(email string) error {
		if !set[strings.ToLower(strings.TrimSpace(email))] {
			return errors.New("sign-up refused: address not on the allowlist")
		}
		return nil
	}
}

// allowlisted lets the request through only if the logged-in user's address
// is still allowed, so taking someone off the list locks them out at once,
// even with a session.
func (s *server) allowlisted(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email, ok := s.opts.UserEmail(r.Context())
		if !ok || !s.allowed[strings.ToLower(email)] {
			writeError(w, http.StatusForbidden, "forbidden", "Your account doesn't have access to the mirror.")
			return
		}
		h.ServeHTTP(w, r)
	})
}

type repoJSON struct {
	Name          string     `json:"name"`
	FullName      string     `json:"full_name"`
	Description   string     `json:"description"`
	DefaultBranch string     `json:"default_branch"`
	Private       bool       `json:"private"`
	Archived      bool       `json:"archived"`
	PushedAt      *time.Time `json:"pushed_at"`
	State         string     `json:"state"`
	OnDisk        bool       `json:"on_disk"`
	LastAttemptAt *time.Time `json:"last_attempt_at"`
	LastSuccessAt *time.Time `json:"last_success_at"`
	LastError     string     `json:"last_error"`
	SizeBytes     int64      `json:"size_bytes"`
}

func toRepoJSON(s mirror.Status) repoJSON {
	return repoJSON{
		Name:          s.Name,
		FullName:      s.FullName,
		Description:   s.Description,
		DefaultBranch: s.DefaultBranch,
		Private:       s.Private,
		Archived:      s.Archived,
		PushedAt:      timePtr(s.PushedAt),
		State:         string(s.State),
		OnDisk:        s.OnDisk,
		LastAttemptAt: timePtr(s.LastAttempt),
		LastSuccessAt: timePtr(s.LastSuccess),
		LastError:     s.LastError,
		SizeBytes:     s.SizeBytes,
	}
}

func timePtr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	u := t.UTC()
	return &u
}

func (s *server) listRepos(w http.ResponseWriter, _ *http.Request) {
	list := s.opts.Mirror.List()
	out := make([]repoJSON, 0, len(list))
	for _, st := range list {
		out = append(out, toRepoJSON(st))
	}
	last, next := s.opts.Mirror.Schedule()
	writeJSON(w, http.StatusOK, map[string]any{
		"repositories": out,
		"syncing":      s.opts.Mirror.Syncing(),
		// When the last full sync finished and the next one starts; null
		// when unknown (none has finished yet, or one is running now)
		"last_run_at": timePtr(last),
		"next_run_at": timePtr(next),
	})
}

func (s *server) getRepo(w http.ResponseWriter, r *http.Request) {
	st, ok := s.status(w, r)
	if !ok {
		return
	}
	resp := struct {
		repoJSON
		Refs *browse.Refs `json:"refs"`
	}{repoJSON: toRepoJSON(st)}
	if st.OnDisk {
		err := s.browse(st.Name, func(repo *browse.Repo) error {
			refs, err := repo.Refs()
			resp.Refs = &refs
			return err
		})
		if err != nil {
			s.fail(w, r, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) tree(w http.ResponseWriter, r *http.Request) {
	st, ok := s.status(w, r)
	if !ok {
		return
	}
	ref, path := r.URL.Query().Get("ref"), r.URL.Query().Get("path")
	var resp map[string]any
	err := s.browse(st.Name, func(repo *browse.Repo) error {
		c, entries, err := repo.Tree(ref, path)
		if err != nil {
			return err
		}
		clean, _ := browse.CleanPath(path)
		resp = map[string]any{"commit": c.Hash.String(), "ref": ref, "path": clean, "entries": entries}
		return nil
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) blob(w http.ResponseWriter, r *http.Request) {
	st, ok := s.status(w, r)
	if !ok {
		return
	}
	ref, path := r.URL.Query().Get("ref"), r.URL.Query().Get("path")
	var resp map[string]any
	err := s.browse(st.Name, func(repo *browse.Repo) error {
		c, f, err := repo.File(ref, path, s.opts.MaxFileSize)
		if err != nil {
			return err
		}
		resp = map[string]any{"commit": c.Hash.String(), "ref": ref, "file": f}
		return nil
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) commits(w http.ResponseWriter, r *http.Request) {
	st, ok := s.status(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	page := 1
	if v := q.Get("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 1000 {
			writeError(w, http.StatusBadRequest, "invalid_page", "page must be a number from 1 to 1000.")
			return
		}
		page = n
	}
	var resp map[string]any
	err := s.browse(st.Name, func(repo *browse.Repo) error {
		commits, more, err := repo.Log(q.Get("ref"), q.Get("path"), page, perPage)
		if err != nil {
			return err
		}
		if commits == nil {
			commits = []browse.Commit{}
		}
		var next *int
		if more {
			n := page + 1
			next = &n
		}
		resp = map[string]any{"commits": commits, "page": page, "next_page": next}
		return nil
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// files lists every file's path at a ref, for searching by name.
func (s *server) files(w http.ResponseWriter, r *http.Request) {
	st, ok := s.status(w, r)
	if !ok {
		return
	}
	ref := r.URL.Query().Get("ref")
	var resp map[string]any
	err := s.browse(st.Name, func(repo *browse.Repo) error {
		c, paths, truncated, err := repo.Files(ref, maxFiles)
		if err != nil {
			return err
		}
		resp = map[string]any{"commit": c.Hash.String(), "ref": ref, "files": paths, "truncated": truncated}
		return nil
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// browse opens a repository's copy, runs fn while no sync can change it, and
// closes it again.
func (s *server) browse(name string, fn func(*browse.Repo) error) error {
	return s.opts.Mirror.Read(name, func(path string) error {
		repo, err := browse.Open(path)
		if err != nil {
			return err
		}
		defer func() { _ = repo.Close() }()
		return fn(repo)
	})
}

// startSync queues a sync of every repository, or with a body of
// {"repository": "<name>"}, of just that one.
func (s *server) startSync(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxSyncBody))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request is too large.")
		return
	}
	if len(bytes.TrimSpace(body)) == 0 {
		writeJSON(w, http.StatusAccepted, map[string]bool{"queued": s.opts.Mirror.Trigger()})
		return
	}
	var req struct {
		Repository string `json:"repository"`
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil || req.Repository == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", `Send no body to sync everything, or {"repository": "<name>"} to sync one.`)
		return
	}
	if !validRepoName.MatchString(req.Repository) {
		writeError(w, http.StatusNotFound, "not_found", "No repository by that name.")
		return
	}
	queued, err := s.opts.Mirror.TriggerRepo(req.Repository)
	switch {
	case errors.Is(err, mirror.ErrNotListed):
		writeError(w, http.StatusConflict, "not_listed", "GitHub doesn't list this repository now, so it can't be synced on its own.")
		return
	case err != nil:
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]bool{"queued": queued})
}

// status looks up the repository named in the path, answering 404 itself.
func (s *server) status(w http.ResponseWriter, r *http.Request) (mirror.Status, bool) {
	name := r.PathValue("name")
	if !validRepoName.MatchString(name) {
		writeError(w, http.StatusNotFound, "not_found", "No repository by that name.")
		return mirror.Status{}, false
	}
	st, ok := s.opts.Mirror.Get(name)
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", "No repository by that name.")
		return mirror.Status{}, false
	}
	return st, true
}

// fail answers a browsing error: client mistakes with their own codes,
// anything else as a logged 500 whose details stay in the log.
func (s *server) fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, mirror.ErrNotFound), errors.Is(err, browse.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "Not found.")
	case errors.Is(err, mirror.ErrNotMirrored):
		writeError(w, http.StatusConflict, "not_mirrored", "This repository hasn't been copied yet.")
	case errors.Is(err, browse.ErrBadPath):
		writeError(w, http.StatusBadRequest, "invalid_path", "That isn't a valid path.")
	case errors.Is(err, browse.ErrBadRef):
		writeError(w, http.StatusBadRequest, "invalid_ref", "ref must be a branch, a tag, or a full commit hash.")
	case errors.Is(err, browse.ErrNotDir):
		writeError(w, http.StatusBadRequest, "not_a_directory", "That path is a file; use the blob endpoint.")
	case errors.Is(err, browse.ErrNotFile):
		writeError(w, http.StatusBadRequest, "not_a_file", "That path is a directory or submodule; use the tree endpoint.")
	default:
		s.log.ErrorContext(r.Context(), "internal error",
			slog.String("request_id", w.Header().Get("X-Request-ID")),
			slog.String("error", err.Error()))
		writeError(w, http.StatusInternalServerError, "internal_error", "Something went wrong. Please try again.")
	}
}

// errorBody is the auth module's error format, so clients handle one shape.
type errorBody struct {
	Error struct {
		Code      string `json:"code"`
		Message   string `json:"message"`
		RequestID string `json:"request_id"`
		Details   []any  `json:"details"`
	} `json:"error"`
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	var b errorBody
	b.Error.Code = code
	b.Error.Message = message
	b.Error.RequestID = w.Header().Get("X-Request-ID")
	writeJSON(w, status, b)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(append(b, '\n'))
}
