package mirror

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-git/go-billy/v5/memfs"
	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport/client"
	"github.com/go-git/go-git/v5/plumbing/transport/server"
	"github.com/go-git/go-git/v5/storage/memory"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/jakefrenzel/cyberlab-mirror/api/internal/github"
)

const testToken = "ghp_testtoken123"

// serveSources makes file:///<name> URLs fetch from in-memory repositories,
// through go-git's embedded server, for the length of the test.
func serveSources(t *testing.T) server.MapLoader {
	t.Helper()
	loader := server.MapLoader{}
	orig := client.Protocols["file"]
	client.InstallProtocol("file", server.NewClient(loader))
	t.Cleanup(func() { client.InstallProtocol("file", orig) })
	return loader
}

// newSource creates an in-memory repository with a worktree, on branch main,
// served at file:///<name>.
func newSource(t *testing.T, loader server.MapLoader, name string) *git.Repository {
	t.Helper()
	repo, err := git.InitWithOptions(memory.NewStorage(), memfs.New(), git.InitOptions{
		DefaultBranch: plumbing.NewBranchReferenceName("main"),
	})
	if err != nil {
		t.Fatal(err)
	}
	loader["file:///"+name] = repo.Storer
	return repo
}

func commit(t *testing.T, repo *git.Repository, files map[string]string, msg string) plumbing.Hash {
	t.Helper()
	wt, err := repo.Worktree()
	if err != nil {
		t.Fatal(err)
	}
	for path, content := range files {
		f, err := wt.Filesystem.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
		_ = f.Close()
		if _, err := wt.Add(path); err != nil {
			t.Fatal(err)
		}
	}
	h, err := wt.Commit(msg, &git.CommitOptions{Author: &object.Signature{Name: "Test", Email: "test@example.com", When: time.Unix(1_700_000_000, 0)}})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

type fakeLister struct {
	mu    sync.Mutex
	repos []github.Repo
	err   error
}

func (f *fakeLister) ListRepos(context.Context) ([]github.Repo, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]github.Repo(nil), f.repos...), f.err
}

func (f *fakeLister) set(repos ...github.Repo) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.repos = repos
}

func ghRepo(name string) github.Repo {
	return github.Repo{Name: name, FullName: "me/" + name, CloneURL: "file:///" + name, DefaultBranch: "main", Private: true}
}

func newManager(t *testing.T, l Lister, dir string) (*Manager, *prometheus.Registry) {
	t.Helper()
	reg := prometheus.NewRegistry()
	m, err := New(l, Options{
		Dir:      dir,
		Token:    testToken,
		AllowURL: func(u string) bool { return strings.HasPrefix(u, "file:///") },
		Metrics:  NewMetrics(reg),
	})
	if err != nil {
		t.Fatal(err)
	}
	return m, reg
}

func refs(t *testing.T, path string) map[string]plumbing.Hash {
	t.Helper()
	repo, err := git.PlainOpen(path)
	if err != nil {
		t.Fatal(err)
	}
	iter, err := repo.References()
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]plumbing.Hash{}
	_ = iter.ForEach(func(r *plumbing.Reference) error {
		if r.Type() == plumbing.HashReference {
			out[r.Name().String()] = r.Hash()
		}
		return nil
	})
	return out
}

func TestSyncCopiesBranchesAndTags(t *testing.T) {
	loader := serveSources(t)
	src := newSource(t, loader, "one")
	main1 := commit(t, src, map[string]string{"README.md": "hello"}, "first")
	feature := commit(t, src, map[string]string{"feature.txt": "f"}, "feature work")
	if err := src.Storer.SetReference(plumbing.NewHashReference("refs/heads/feature", feature)); err != nil {
		t.Fatal(err)
	}
	if err := src.Storer.SetReference(plumbing.NewHashReference("refs/heads/main", main1)); err != nil {
		t.Fatal(err)
	}
	if _, err := src.CreateTag("v1.0.0", main1, nil); err != nil {
		t.Fatal(err)
	}
	// GitHub's pull request refs aren't copied
	if err := src.Storer.SetReference(plumbing.NewHashReference("refs/pull/1/head", feature)); err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	m, reg := newManager(t, &fakeLister{repos: []github.Repo{ghRepo("one")}}, dir)
	m.SyncAll(context.Background())

	s, ok := m.Get("one")
	if !ok || s.State != StateOK || !s.OnDisk || s.SizeBytes == 0 || s.LastError != "" {
		t.Fatalf("status = %+v", s)
	}
	got := refs(t, filepath.Join(dir, "one.git"))
	want := map[string]plumbing.Hash{"refs/heads/main": main1, "refs/heads/feature": feature, "refs/tags/v1.0.0": main1}
	if len(got) != len(want) {
		t.Errorf("refs = %v, want %v", got, want)
	}
	for name, h := range want {
		if got[name] != h {
			t.Errorf("%s = %s, want %s", name, got[name], h)
		}
	}

	copyRepo, _ := git.PlainOpen(filepath.Join(dir, "one.git"))
	head, err := copyRepo.Storer.Reference(plumbing.HEAD)
	if err != nil || head.Target() != "refs/heads/main" {
		t.Errorf("HEAD = %v (%v), want refs/heads/main", head, err)
	}
	cfg, err := os.ReadFile(filepath.Join(dir, "one.git", "config"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(cfg), "file:///one") || strings.Contains(string(cfg), testToken) {
		t.Errorf("config should hold the plain URL and no token:\n%s", cfg)
	}
	if v := testutil.ToFloat64(m.metrics.repos.WithLabelValues("ok")); v != 1 {
		t.Errorf("repositories{state=ok} = %v", v)
	}
	if n, _ := testutil.GatherAndCount(reg, "cyberlab_mirror_last_sync_run_timestamp_seconds"); n != 1 {
		t.Errorf("last run timestamp missing")
	}
}

func TestSyncFollowsUpdatesAndDeletedBranches(t *testing.T) {
	loader := serveSources(t)
	src := newSource(t, loader, "one")
	commit(t, src, map[string]string{"a.txt": "1"}, "one")
	h := commit(t, src, map[string]string{"b.txt": "2"}, "two")
	_ = src.Storer.SetReference(plumbing.NewHashReference("refs/heads/old", h))

	dir := t.TempDir()
	m, _ := newManager(t, &fakeLister{repos: []github.Repo{ghRepo("one")}}, dir)
	m.SyncAll(context.Background())

	newHead := commit(t, src, map[string]string{"c.txt": "3"}, "three")
	_ = src.Storer.RemoveReference("refs/heads/old")
	m.SyncAll(context.Background())

	got := refs(t, filepath.Join(dir, "one.git"))
	if got["refs/heads/main"] != newHead {
		t.Errorf("main = %s, want %s", got["refs/heads/main"], newHead)
	}
	if _, ok := got["refs/heads/old"]; ok {
		t.Error("deleted branch is still in the copy")
	}
}

func TestRepositoryGoneFromGitHubIsKept(t *testing.T) {
	loader := serveSources(t)
	src := newSource(t, loader, "one")
	commit(t, src, map[string]string{"a.txt": "1"}, "one")

	dir := t.TempDir()
	l := &fakeLister{repos: []github.Repo{ghRepo("one"), ghRepo("never-copied")}}
	m, _ := newManager(t, l, dir)
	m.SyncAll(context.Background())

	l.set()
	m.SyncAll(context.Background())
	s, ok := m.Get("one")
	if !ok || s.State != StateGone || !s.OnDisk {
		t.Fatalf("status = %+v, want gone and kept", s)
	}
	if _, err := os.Stat(filepath.Join(dir, "one.git")); err != nil {
		t.Errorf("copy removed: %v", err)
	}
	if _, ok := m.Get("never-copied"); ok {
		t.Error("a repository never copied should be forgotten, not kept as gone")
	}

	l.set(ghRepo("one"))
	m.SyncAll(context.Background())
	if s, _ := m.Get("one"); s.State != StateOK {
		t.Errorf("after it's back: state = %s", s.State)
	}
}

func TestEmptyRepositories(t *testing.T) {
	loader := serveSources(t)
	newSource(t, loader, "no-commits")

	dir := t.TempDir()
	flagged := ghRepo("flagged-empty")
	flagged.Empty = true
	m, _ := newManager(t, &fakeLister{repos: []github.Repo{flagged, ghRepo("no-commits")}}, dir)
	m.SyncAll(context.Background())

	for _, name := range []string{"flagged-empty", "no-commits"} {
		s, _ := m.Get(name)
		if s.State != StateEmpty || s.OnDisk {
			t.Errorf("%s: status = %+v, want empty and not on disk", name, s)
		}
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("nothing should be on disk, found %d entries (temporary directories left behind?)", len(entries))
	}
}

func TestFailedSyncKeepsTheOldCopy(t *testing.T) {
	loader := serveSources(t)
	src := newSource(t, loader, "one")
	h := commit(t, src, map[string]string{"a.txt": "1"}, "one")

	dir := t.TempDir()
	l := &fakeLister{repos: []github.Repo{ghRepo("one")}}
	m, _ := newManager(t, l, dir)
	m.SyncAll(context.Background())

	delete(loader, "file:///one")
	m.SyncAll(context.Background())

	s, _ := m.Get("one")
	if s.State != StateFailed || !s.OnDisk || s.LastError == "" || s.LastSuccess.IsZero() {
		t.Fatalf("status = %+v", s)
	}
	if got := refs(t, filepath.Join(dir, "one.git"))["refs/heads/main"]; got != h {
		t.Errorf("old copy changed: main = %s", got)
	}
	if v := testutil.ToFloat64(m.metrics.failures.WithLabelValues("one")); v != 1 {
		t.Errorf("failures = %v, want 1", v)
	}
	if v := testutil.ToFloat64(m.metrics.runs.WithLabelValues("partial")); v != 1 {
		t.Errorf("partial runs = %v, want 1", v)
	}
}

func TestOnlyGitHubURLsByDefault(t *testing.T) {
	loader := serveSources(t)
	src := newSource(t, loader, "one")
	commit(t, src, map[string]string{"a.txt": "1"}, "one")

	m, err := New(&fakeLister{repos: []github.Repo{ghRepo("one")}}, Options{Dir: t.TempDir(), Token: testToken})
	if err != nil {
		t.Fatal(err)
	}
	m.SyncAll(context.Background())
	s, _ := m.Get("one")
	if s.State != StateFailed || !strings.Contains(s.LastError, "isn't allowed") || s.OnDisk {
		t.Errorf("status = %+v, want refused", s)
	}
}

func TestRestartPicksUpCopiesAndCleansLeftovers(t *testing.T) {
	loader := serveSources(t)
	src := newSource(t, loader, "one")
	commit(t, src, map[string]string{"a.txt": "1"}, "one")

	dir := t.TempDir()
	m, _ := newManager(t, &fakeLister{repos: []github.Repo{ghRepo("one")}}, dir)
	m.SyncAll(context.Background())

	for _, d := range []string{".tmp-one-abc123", "not a repo.git", "notes"} {
		if err := os.Mkdir(filepath.Join(dir, d), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	restarted, _ := newManager(t, &fakeLister{}, dir)
	list := restarted.List()
	if len(list) != 1 || list[0].Name != "one" || list[0].State != StatePending || !list[0].OnDisk {
		t.Fatalf("after restart: %+v", list)
	}
	if _, err := os.Stat(filepath.Join(dir, ".tmp-one-abc123")); !errors.Is(err, os.ErrNotExist) {
		t.Error("leftover temporary directory wasn't removed")
	}
}

func TestListFailureChangesNothing(t *testing.T) {
	l := &fakeLister{err: errors.New("github is down")}
	m, _ := newManager(t, l, t.TempDir())
	m.SyncAll(context.Background())
	if len(m.List()) != 0 {
		t.Error("repositories appeared from a failed list")
	}
	if v := testutil.ToFloat64(m.metrics.runs.WithLabelValues("list_failed")); v != 1 {
		t.Errorf("list_failed runs = %v", v)
	}
}

func TestRead(t *testing.T) {
	loader := serveSources(t)
	src := newSource(t, loader, "one")
	commit(t, src, map[string]string{"a.txt": "1"}, "one")
	dir := t.TempDir()
	flagged := ghRepo("empty")
	flagged.Empty = true
	m, _ := newManager(t, &fakeLister{repos: []github.Repo{ghRepo("one"), flagged}}, dir)
	m.SyncAll(context.Background())

	if err := m.Read("nope", func(string) error { return nil }); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
	if err := m.Read("empty", func(string) error { return nil }); !errors.Is(err, ErrNotMirrored) {
		t.Errorf("empty: %v", err)
	}
	var got string
	if err := m.Read("one", func(p string) error { got = p; return nil }); err != nil || got != filepath.Join(dir, "one.git") {
		t.Errorf("one: path %q, err %v", got, err)
	}
}

func TestTrigger(t *testing.T) {
	m, _ := newManager(t, &fakeLister{}, t.TempDir())
	if !m.Trigger() {
		t.Error("first trigger should be queued")
	}
	if m.Trigger() {
		t.Error("second trigger should report one is already queued")
	}
}

func TestRedact(t *testing.T) {
	m, _ := newManager(t, &fakeLister{}, t.TempDir())
	got := m.redact(errors.New("auth failed for https://x-access-token:" + testToken + "@github.com/me/one.git"))
	if strings.Contains(got, testToken) || !strings.Contains(got, "[token]") {
		t.Errorf("redact = %q", got)
	}
	if long := m.redact(errors.New(strings.Repeat("x", 2000))); len(long) > 510 {
		t.Errorf("not bounded: %d bytes", len(long))
	}
}

func TestSyncOneRetriesOnlyThatRepository(t *testing.T) {
	loader := serveSources(t)
	newSource(t, loader, "two")
	commit(t, newSource(t, loader, "one"), map[string]string{"a.txt": "1"}, "one")

	dir := t.TempDir()
	m, _ := newManager(t, &fakeLister{repos: []github.Repo{ghRepo("one"), ghRepo("two"), ghRepo("broken")}}, dir)
	m.SyncAll(context.Background())
	if s, _ := m.Get("broken"); s.State != StateFailed {
		t.Fatalf("broken: state = %s, want failed", s.State)
	}
	oneBefore, _ := m.Get("one")

	// The source turns up, and only it is synced again
	commit(t, newSource(t, loader, "broken"), map[string]string{"b.txt": "2"}, "fixed")
	m.SyncOne(context.Background(), "broken")
	if s, _ := m.Get("broken"); s.State != StateOK || !s.OnDisk || s.LastError != "" {
		t.Errorf("broken after retry: %+v", s)
	}
	if s, _ := m.Get("one"); !s.LastAttempt.Equal(oneBefore.LastAttempt) {
		t.Error("retrying one repository synced another")
	}
	if v := testutil.ToFloat64(m.metrics.repos.WithLabelValues("failed")); v != 0 {
		t.Errorf("repositories{state=failed} = %v after the retry, want 0", v)
	}
}

func TestTriggerRepo(t *testing.T) {
	loader := serveSources(t)
	commit(t, newSource(t, loader, "one"), map[string]string{"a.txt": "1"}, "one")
	dir := t.TempDir()
	l := &fakeLister{repos: []github.Repo{ghRepo("one")}}
	m, _ := newManager(t, l, dir)

	if _, err := m.TriggerRepo("nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown: %v", err)
	}
	m.SyncAll(context.Background())
	if ok, err := m.TriggerRepo("one"); !ok || err != nil {
		t.Errorf("first: %v, %v", ok, err)
	}
	if ok, err := m.TriggerRepo("one"); ok || err != nil {
		t.Errorf("second should report one is already queued: %v, %v", ok, err)
	}

	// Gone from GitHub: nothing to fetch it from
	<-m.triggerRepo
	l.set()
	m.SyncAll(context.Background())
	if _, err := m.TriggerRepo("one"); !errors.Is(err, ErrNotListed) {
		t.Errorf("gone: %v", err)
	}

	// Found on disk after a restart, before GitHub has listed it
	m2, _ := newManager(t, &fakeLister{}, dir)
	if _, err := m2.TriggerRepo("one"); !errors.Is(err, ErrNotListed) {
		t.Errorf("not listed yet: %v", err)
	}
}

func TestRunSchedule(t *testing.T) {
	reg := prometheus.NewRegistry()
	m, err := New(&fakeLister{}, Options{Dir: t.TempDir(), Interval: time.Hour, Metrics: NewMetrics(reg)})
	if err != nil {
		t.Fatal(err)
	}
	if last, next := m.Schedule(); !last.IsZero() || !next.IsZero() {
		t.Errorf("before the first run: last %v, next %v", last, next)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { m.Run(ctx); close(done) }()
	deadline := time.Now().Add(5 * time.Second)
	var last, next time.Time
	for time.Now().Before(deadline) {
		if last, next = m.Schedule(); !next.IsZero() {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	<-done
	if last.IsZero() || next.Sub(last) < 59*time.Minute || next.Sub(last) > time.Hour+time.Second {
		t.Errorf("after the first run: last %v, next %v (want about an hour apart)", last, next)
	}
}
