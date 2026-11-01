// Package mirror keeps bare copies of GitHub repositories on disk and
// refreshes them on a schedule.
//
// Each repository is a bare repository at <dir>/<name>.git holding GitHub's
// branches and tags (pull request refs are left out). A first copy is fetched
// into a temporary directory and renamed into place, so a half-finished clone
// is never served. Repositories that disappear from GitHub are kept and marked
// gone: this is a backup, so nothing is deleted automatically.
package mirror

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/transport"
	githttp "github.com/go-git/go-git/v5/plumbing/transport/http"

	"github.com/jakefrenzel/cyberlab-mirror/api/internal/github"
	"github.com/jakefrenzel/cyberlab-mirror/api/internal/gitstore"
)

// State is where a repository's copy stands.
type State string

const (
	// StatePending is a repository not synced since the process started. Its
	// copy may already be on disk from before.
	StatePending State = "pending"
	// StateOK is a repository whose last sync succeeded.
	StateOK State = "ok"
	// StateEmpty is a repository with no commits on GitHub.
	StateEmpty State = "empty"
	// StateFailed is a repository whose last sync failed. An older copy may
	// still be on disk.
	StateFailed State = "failed"
	// StateGone is a copy on disk of a repository no longer on GitHub (or no
	// longer readable with the token). It's kept.
	StateGone State = "gone"
)

// States lists every State, for metrics.
var States = []State{StatePending, StateOK, StateEmpty, StateFailed, StateGone}

// ErrNotFound means there's no repository by that name.
var ErrNotFound = errors.New("mirror: repository not found")

// ErrNotMirrored means the repository is known but has no copy on disk yet.
var ErrNotMirrored = errors.New("mirror: repository not mirrored yet")

// validName matches internal/github: names become directory names.
var validName = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)

// refSpecs are what's copied: branches and tags, force-updated so the copy
// matches GitHub. GitHub's refs/pull/* are left out.
var refSpecs = []config.RefSpec{
	"+refs/heads/*:refs/heads/*",
	"+refs/tags/*:refs/tags/*",
}

// Status describes one repository.
type Status struct {
	Name          string
	FullName      string
	Description   string
	DefaultBranch string
	Private       bool
	Archived      bool
	PushedAt      time.Time
	State         State
	// OnDisk is true when there's a copy that can be browsed.
	OnDisk      bool
	LastAttempt time.Time
	LastSuccess time.Time
	// LastError is the last sync's error, with the token removed.
	LastError string
	SizeBytes int64
}

// Lister lists the repositories to mirror. *github.Client implements it.
type Lister interface {
	ListRepos(ctx context.Context) ([]github.Repo, error)
}

// Options configures a Manager.
type Options struct {
	// Dir holds the copies. Required.
	Dir string
	// Token authenticates fetches over https.
	Token string
	// Interval is the time between syncs. Default: 6 hours.
	Interval time.Duration
	// Concurrency is how many repositories sync at once. Default: 2.
	Concurrency int
	// CacheSize bounds each syncing repository's object cache, in bytes.
	// Default: 16 MiB (go-git's own default is 96 MiB).
	CacheSize int64
	// RepoTimeout bounds one repository's sync. Default: 10 minutes.
	RepoTimeout time.Duration
	// AllowURL decides which clone URLs may be fetched. Default: only
	// https://github.com/. Tests allow local paths.
	AllowURL func(string) bool
	Logger   *slog.Logger
	Metrics  *Metrics
	// Now is the clock. Default: time.Now.
	Now func() time.Time
}

// Manager mirrors the repositories its Lister returns.
type Manager struct {
	opts    Options
	lister  Lister
	log     *slog.Logger
	now     func() time.Time
	metrics *Metrics

	mu    sync.RWMutex
	repos map[string]*entry

	running atomic.Bool
	trigger chan struct{}
}

type entry struct {
	// data guards the copy on disk: read lock to browse, write lock to
	// fetch or move it into place.
	data   sync.RWMutex
	status Status
}

// New returns a Manager. Call Run to start syncing.
func New(lister Lister, opts Options) (*Manager, error) {
	if opts.Dir == "" {
		return nil, errors.New("mirror: Dir is required")
	}
	if opts.Interval <= 0 {
		opts.Interval = 6 * time.Hour
	}
	if opts.Concurrency <= 0 {
		opts.Concurrency = 2
	}
	if opts.CacheSize <= 0 {
		opts.CacheSize = 16 << 20
	}
	if opts.RepoTimeout <= 0 {
		opts.RepoTimeout = 10 * time.Minute
	}
	if opts.AllowURL == nil {
		opts.AllowURL = func(u string) bool { return strings.HasPrefix(u, "https://github.com/") }
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.Metrics == nil {
		opts.Metrics = NewMetrics(nil)
	}
	if err := os.MkdirAll(opts.Dir, 0o750); err != nil {
		return nil, fmt.Errorf("mirror: creating %s: %w", opts.Dir, err)
	}
	m := &Manager{
		opts:    opts,
		lister:  lister,
		log:     opts.Logger,
		now:     opts.Now,
		metrics: opts.Metrics,
		repos:   map[string]*entry{},
		trigger: make(chan struct{}, 1),
	}
	if err := m.loadFromDisk(); err != nil {
		return nil, err
	}
	m.updateStateMetrics()
	return m, nil
}

// Run syncs now, then every Interval or when triggered, until ctx ends.
func (m *Manager) Run(ctx context.Context) {
	t := time.NewTicker(m.opts.Interval)
	defer t.Stop()
	for {
		m.SyncAll(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-m.trigger:
		}
	}
}

// Trigger asks Run to sync now. It returns false if a sync is already
// running or queued.
func (m *Manager) Trigger() bool {
	if m.running.Load() {
		return false
	}
	select {
	case m.trigger <- struct{}{}:
		return true
	default:
		return false
	}
}

// Syncing reports whether a sync is running.
func (m *Manager) Syncing() bool { return m.running.Load() }

// List returns every repository, sorted by name.
func (m *Manager) List() []Status {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]Status, 0, len(m.repos))
	for _, e := range m.repos {
		out = append(out, e.status)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Get returns one repository's status.
func (m *Manager) Get(name string) (Status, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	e, ok := m.repos[name]
	if !ok {
		return Status{}, false
	}
	return e.status, true
}

// Read runs fn with the path of a repository's copy, while no sync can
// change it.
func (m *Manager) Read(name string, fn func(path string) error) error {
	m.mu.RLock()
	e, ok := m.repos[name]
	onDisk := ok && e.status.OnDisk
	m.mu.RUnlock()
	if !ok {
		return ErrNotFound
	}
	if !onDisk {
		return ErrNotMirrored
	}
	e.data.RLock()
	defer e.data.RUnlock()
	return fn(m.path(name))
}

// SyncAll lists the repositories and syncs each one. Failures are recorded
// per repository; it only gives up early if the list itself fails.
func (m *Manager) SyncAll(ctx context.Context) {
	if !m.running.CompareAndSwap(false, true) {
		return
	}
	defer m.running.Store(false)
	start := m.now()

	repos, err := m.lister.ListRepos(ctx)
	if err != nil {
		m.log.ErrorContext(ctx, "mirror: listing repositories", slog.String("error", m.redact(err)))
		m.metrics.runs.WithLabelValues("list_failed").Inc()
		return
	}

	seen := make(map[string]bool, len(repos))
	for _, r := range repos {
		seen[r.Name] = true
		m.upsert(r)
	}
	m.markGone(seen)

	sem := make(chan struct{}, m.opts.Concurrency)
	var wg sync.WaitGroup
	var failed atomic.Int32
	for _, r := range repos {
		if ctx.Err() != nil {
			break
		}
		sem <- struct{}{}
		wg.Go(func() {
			defer func() { <-sem }()
			if !m.syncRepo(ctx, r) {
				failed.Add(1)
			}
		})
	}
	wg.Wait()

	result := "ok"
	if failed.Load() > 0 {
		result = "partial"
	}
	m.metrics.runs.WithLabelValues(result).Inc()
	m.metrics.duration.Observe(m.now().Sub(start).Seconds())
	m.metrics.lastRun.Set(float64(m.now().Unix()))
	m.updateStateMetrics()
	m.log.InfoContext(ctx, "mirror: sync finished",
		slog.Int("repositories", len(repos)),
		slog.Int("failed", int(failed.Load())),
		slog.Duration("took", m.now().Sub(start)))
}

// syncRepo fetches one repository and records the outcome. It returns false
// if the sync failed.
func (m *Manager) syncRepo(ctx context.Context, r github.Repo) bool {
	ctx, cancel := context.WithTimeout(ctx, m.opts.RepoTimeout)
	defer cancel()

	m.mu.RLock()
	e := m.repos[r.Name]
	onDisk := e.status.OnDisk
	m.mu.RUnlock()

	// Logged before the fetch: if the process dies mid-sync (out of memory, for
	// one), the last "syncing" line without a result names the repository
	m.log.InfoContext(ctx, "mirror: syncing", slog.String("repository", r.Name))
	started := m.now()

	var err error
	empty := false
	switch {
	case !m.opts.AllowURL(r.CloneURL):
		err = fmt.Errorf("clone URL %q isn't allowed", r.CloneURL)
	case r.Empty && !onDisk:
		// Nothing to fetch; GitHub says it has no commits
		empty = true
	default:
		empty, err = m.fetch(ctx, e, r)
	}
	var size int64
	if err == nil && !empty {
		size = dirSize(m.path(r.Name))
	}

	now := m.now()
	m.mu.Lock()
	defer m.mu.Unlock()
	s := &e.status
	s.LastAttempt = now
	switch {
	case err != nil:
		s.State = StateFailed
		s.LastError = m.redact(err)
		m.metrics.failures.WithLabelValues(r.Name).Inc()
		m.log.WarnContext(ctx, "mirror: sync failed", slog.String("repository", r.Name), slog.String("error", s.LastError))
		return false
	case empty:
		s.State = StateEmpty
		s.LastError = ""
		s.LastSuccess = now
		m.log.InfoContext(ctx, "mirror: synced", slog.String("repository", r.Name), slog.String("result", "empty"))
	default:
		s.State = StateOK
		s.LastError = ""
		s.LastSuccess = now
		s.OnDisk = true
		s.SizeBytes = size
		m.metrics.size.WithLabelValues(r.Name).Set(float64(size))
		m.log.InfoContext(ctx, "mirror: synced", slog.String("repository", r.Name),
			slog.Int64("bytes", size), slog.Duration("took", now.Sub(started)))
	}
	m.metrics.lastSuccess.WithLabelValues(r.Name).Set(float64(now.Unix()))
	return true
}

// fetch updates the copy, or creates it in a temporary directory and moves
// it into place. empty is true when GitHub has no commits for it.
func (m *Manager) fetch(ctx context.Context, e *entry, r github.Repo) (empty bool, err error) {
	path := m.path(r.Name)
	if _, statErr := os.Stat(path); statErr == nil {
		e.data.Lock()
		defer e.data.Unlock()
		return m.fetchInto(ctx, path, r)
	}

	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		return false, err
	}
	tmp := filepath.Join(m.opts.Dir, ".tmp-"+r.Name+"-"+hex.EncodeToString(suffix))
	defer func() { _ = os.RemoveAll(tmp) }()
	if _, err := git.PlainInit(tmp, true); err != nil {
		return false, fmt.Errorf("initializing: %w", err)
	}
	empty, err = m.fetchInto(ctx, tmp, r)
	if err != nil || empty {
		return empty, err
	}
	e.data.Lock()
	defer e.data.Unlock()
	if err := os.Rename(tmp, path); err != nil {
		return false, fmt.Errorf("moving into place: %w", err)
	}
	return false, nil
}

// fetchInto fetches GitHub's branches and tags into the bare repository at
// path and points its HEAD at the default branch.
func (m *Manager) fetchInto(ctx context.Context, path string, r github.Repo) (empty bool, err error) {
	repo, err := gitstore.Open(path, m.opts.CacheSize)
	if err != nil {
		return false, err
	}
	defer func() { _ = repo.Close() }()
	// The remote is GitHub's plain clone URL, rewritten when it changes (a
	// renamed repository). The token is never stored: it's passed per fetch.
	cfg, err := repo.Config()
	if err != nil {
		return false, fmt.Errorf("reading config: %w", err)
	}
	if rc := cfg.Remotes["origin"]; rc == nil || len(rc.URLs) != 1 || rc.URLs[0] != r.CloneURL {
		cfg.Remotes["origin"] = &config.RemoteConfig{Name: "origin", URLs: []string{r.CloneURL}, Fetch: refSpecs}
		if err := repo.SetConfig(cfg); err != nil {
			return false, fmt.Errorf("setting remote: %w", err)
		}
	}

	opts := &git.FetchOptions{
		RemoteName: "origin",
		RefSpecs:   refSpecs,
		Tags:       git.NoTags,
		Prune:      true,
		Force:      true,
	}
	// No token, no credentials: public repositories can be fetched anonymously
	if strings.HasPrefix(r.CloneURL, "https://") && m.opts.Token != "" {
		opts.Auth = &githttp.BasicAuth{Username: "x-access-token", Password: m.opts.Token}
	}
	err = repo.FetchContext(ctx, opts)
	switch {
	case errors.Is(err, git.NoErrAlreadyUpToDate):
	case errors.Is(err, transport.ErrEmptyRemoteRepository):
		return true, nil
	case err != nil:
		return false, fmt.Errorf("fetching: %w", err)
	}

	if r.DefaultBranch != "" {
		head := plumbing.NewSymbolicReference(plumbing.HEAD, plumbing.NewBranchReferenceName(r.DefaultBranch))
		if err := repo.Storer.SetReference(head); err != nil {
			return false, fmt.Errorf("setting HEAD: %w", err)
		}
	}
	return false, nil
}

// upsert records a repository from GitHub's list, keeping its sync state.
func (m *Manager) upsert(r github.Repo) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.repos[r.Name]
	if !ok {
		e = &entry{status: Status{Name: r.Name, State: StatePending}}
		m.repos[r.Name] = e
	}
	s := &e.status
	s.FullName = r.FullName
	s.Description = r.Description
	s.DefaultBranch = r.DefaultBranch
	s.Private = r.Private
	s.Archived = r.Archived
	s.PushedAt = r.PushedAt
	if s.State == StateGone {
		s.State = StatePending
	}
}

// markGone marks every repository not in seen as gone. Ones that were never
// copied are forgotten instead.
func (m *Manager) markGone(seen map[string]bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for name, e := range m.repos {
		if seen[name] {
			continue
		}
		if !e.status.OnDisk {
			delete(m.repos, name)
			m.metrics.forget(name)
			continue
		}
		e.status.State = StateGone
	}
}

// loadFromDisk registers the copies already on disk, from before a restart.
// They're pending until the first sync, or gone if GitHub no longer has them.
// Leftover temporary directories from an interrupted first copy are removed.
func (m *Manager) loadFromDisk() error {
	entries, err := os.ReadDir(m.opts.Dir)
	if err != nil {
		return fmt.Errorf("mirror: reading %s: %w", m.opts.Dir, err)
	}
	for _, de := range entries {
		if !de.IsDir() {
			continue
		}
		if strings.HasPrefix(de.Name(), ".tmp-") {
			if err := os.RemoveAll(filepath.Join(m.opts.Dir, de.Name())); err != nil {
				return fmt.Errorf("mirror: removing leftover %s: %w", de.Name(), err)
			}
			continue
		}
		name, ok := strings.CutSuffix(de.Name(), ".git")
		if !ok || !validName.MatchString(name) {
			continue
		}
		m.repos[name] = &entry{status: Status{
			Name:      name,
			State:     StatePending,
			OnDisk:    true,
			SizeBytes: dirSize(m.path(name)),
		}}
	}
	return nil
}

func (m *Manager) updateStateMetrics() {
	counts := map[State]int{}
	for _, s := range m.List() {
		counts[s.State]++
	}
	for _, st := range States {
		m.metrics.repos.WithLabelValues(string(st)).Set(float64(counts[st]))
	}
}

func (m *Manager) path(name string) string {
	return filepath.Join(m.opts.Dir, name+".git")
}

// redact removes the token from an error, in case a library ever puts it in
// one, and bounds its length.
func (m *Manager) redact(err error) string {
	s := err.Error()
	if m.opts.Token != "" {
		s = strings.ReplaceAll(s, m.opts.Token, "[token]")
	}
	if len(s) > 500 {
		s = s[:500] + "…"
	}
	return s
}

func dirSize(path string) int64 {
	var total int64
	_ = filepath.WalkDir(path, func(_ string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if info, err := d.Info(); err == nil && info.Mode().IsRegular() {
			total += info.Size()
		}
		return nil
	})
	return total
}
