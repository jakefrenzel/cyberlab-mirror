// Package gitstore opens bare repositories on disk with bounded memory.
//
// go-git's PlainOpen gives every repository a 96 MiB object cache, and reads
// whole objects into memory. With several repositories open at once (four syncs,
// plus browsing) that outgrew a 256 MiB container and got the API OOM-killed.
// Here the cache is sized by the caller, and objects over LargeObjectThreshold
// are read from disk as they're used instead of loaded whole.
package gitstore

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/go-git/go-billy/v5/osfs"
	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/cache"
	"github.com/go-git/go-git/v5/storage/filesystem"
)

// LargeObjectThreshold is the size above which an object isn't cached or held
// in memory whole.
const LargeObjectThreshold = 1 << 20

// Repo is an open repository and the storage to close with it.
type Repo struct {
	*git.Repository
	storage *filesystem.Storage
}

// Open opens the repository at path with an object cache of at most cacheSize
// bytes. The mirror's copies are bare; a repository with a working tree (path
// holding a .git directory) works too.
func Open(path string, cacheSize int64) (*Repo, error) {
	dot := path
	if fi, err := os.Stat(filepath.Join(path, ".git")); err == nil && fi.IsDir() {
		dot = filepath.Join(path, ".git")
	}
	s := filesystem.NewStorageWithOptions(
		osfs.New(dot),
		cache.NewObjectLRU(cache.FileSize(cacheSize)),
		filesystem.Options{LargeObjectThreshold: LargeObjectThreshold},
	)
	r, err := git.Open(s, nil)
	if err != nil {
		return nil, fmt.Errorf("opening repository: %w", err)
	}
	return &Repo{Repository: r, storage: s}, nil
}

// Close releases the repository's open files.
func (r *Repo) Close() error {
	return r.storage.Close()
}
