package browse

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// TestNoDescriptorLeak opens a repository of loose objects (what a fresh
// commit leaves, unlike a fetched packfile) over and over and checks the
// process isn't left holding its files. go-git v5.19.3's EncodedObjectSize
// leaked one per loose file.
func TestNoDescriptorLeak(t *testing.T) {
	dir := t.TempDir()
	r, err := git.PlainInit(dir, false)
	if err != nil {
		t.Fatal(err)
	}
	wt, _ := r.Worktree()
	for _, name := range []string{"a.txt", "b.txt", "c.txt", "d.txt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(name), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := wt.Add(name); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := wt.Commit("files", &git.CommitOptions{Author: &object.Signature{Name: "T", Email: "t@example.com", When: time.Now()}}); err != nil {
		t.Fatal(err)
	}

	use := func() {
		repo, err := Open(dir)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = repo.Close() }()
		if _, _, err := repo.Tree("", ""); err != nil {
			t.Fatal(err)
		}
		if _, _, err := repo.File("", "a.txt", 1<<20); err != nil {
			t.Fatal(err)
		}
		if _, _, err := repo.Log("", "", 1, 10); err != nil {
			t.Fatal(err)
		}
		if _, err := repo.Refs(); err != nil {
			t.Fatal(err)
		}
	}
	use() // warm up anything opened once
	before := openFiles(t)
	for range 50 {
		use()
	}
	if after := openFiles(t); after > before+3 {
		t.Errorf("open files grew from %d to %d over 50 uses", before, after)
	}
}

func openFiles(t *testing.T) int {
	t.Helper()
	fds, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		t.Skip("no /proc/self/fd")
	}
	return len(fds)
}
