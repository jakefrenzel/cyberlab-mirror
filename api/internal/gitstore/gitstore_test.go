package gitstore

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

func TestOpensBareAndNonBare(t *testing.T) {
	work := t.TempDir()
	r, err := git.PlainInit(work, false)
	if err != nil {
		t.Fatal(err)
	}
	wt, _ := r.Worktree()
	if err := os.WriteFile(filepath.Join(work, "a.txt"), []byte("a"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := wt.Add("a.txt"); err != nil {
		t.Fatal(err)
	}
	h, err := wt.Commit("a", &git.CommitOptions{Author: &object.Signature{Name: "T", Email: "t@example.com", When: time.Now()}})
	if err != nil {
		t.Fatal(err)
	}
	bare := filepath.Join(t.TempDir(), "copy.git")
	if _, err := git.PlainClone(bare, true, &git.CloneOptions{URL: work}); err != nil {
		t.Fatal(err)
	}

	for name, path := range map[string]string{"non-bare": work, "bare": bare} {
		repo, err := Open(path, 1<<20)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		head, err := repo.Head()
		if err != nil || head.Hash() != h {
			t.Errorf("%s: HEAD = %v, %v; want %s", name, head, err, h)
		}
		if err := repo.Close(); err != nil {
			t.Errorf("%s: close: %v", name, err)
		}
	}
	if _, err := Open(t.TempDir(), 1<<20); err == nil {
		t.Error("an empty directory opened as a repository")
	}
}
