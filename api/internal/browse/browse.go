// Package browse reads a bare repository: its branches and tags, the tree and
// files at a commit, and the commit history.
//
// Everything is read from git's object database, never through the
// filesystem, so a path can't reach outside the repository; paths and refs are
// still validated strictly, so bad ones fail clearly instead of by accident.
// Symlinks are reported, never followed.
package browse

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/object"

	"github.com/jakefrenzel/cyberlab-mirror/api/internal/gitstore"
)

var (
	// ErrBadPath is a path that isn't a plain relative path.
	ErrBadPath = errors.New("browse: invalid path")
	// ErrBadRef is a ref that isn't a branch name, tag name, or full commit hash.
	ErrBadRef = errors.New("browse: invalid ref")
	// ErrNotFound is a ref or path that doesn't exist.
	ErrNotFound = errors.New("browse: not found")
	// ErrNotDir is a tree request for something that isn't a directory.
	ErrNotDir = errors.New("browse: not a directory")
	// ErrNotFile is a file request for a directory or submodule.
	ErrNotFile = errors.New("browse: not a file")
)

// MaxPath bounds a path's length.
const MaxPath = 1024

// binarySniff is how much of a file is checked for NUL bytes, as git does.
const binarySniff = 8000

var (
	// refPattern allows the characters branch and tag names use in practice;
	// the checks in validRef cover the rest of git's rules that matter here.
	refPattern  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/+-]{0,254}$`)
	hashPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// Ref is a branch or tag and the commit it points at.
type Ref struct {
	Name   string `json:"name"`
	Commit string `json:"commit"`
}

// Refs are a repository's branches and tags.
type Refs struct {
	// Head is the default branch's name, or "" if HEAD doesn't point at one.
	Head     string `json:"head"`
	Branches []Ref  `json:"branches"`
	Tags     []Ref  `json:"tags"`
}

// Entry is one item in a directory.
type Entry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	// Type is "dir", "file", "symlink", or "submodule".
	Type string `json:"type"`
	// Size is the file's size in bytes; 0 for directories and submodules.
	Size       int64 `json:"size"`
	Executable bool  `json:"executable"`
}

// File is a file's metadata and, for text under the size limit, its content.
type File struct {
	Path string `json:"path"`
	// Type is "file" or "symlink".
	Type       string `json:"type"`
	Size       int64  `json:"size"`
	Executable bool   `json:"executable"`
	// Binary means the content isn't valid UTF-8 text, so it isn't returned.
	Binary bool `json:"binary"`
	// TooLarge means it's over the size limit, so content isn't returned.
	TooLarge bool `json:"too_large"`
	// Content is the text, when it's neither Binary nor TooLarge.
	Content string `json:"content"`
	// Target is a symlink's target path. It's never followed.
	Target string `json:"target,omitempty"`
}

// Commit is one commit in the history.
type Commit struct {
	Hash        string    `json:"hash"`
	Summary     string    `json:"summary"`
	Message     string    `json:"message"`
	AuthorName  string    `json:"author_name"`
	AuthorEmail string    `json:"author_email"`
	AuthoredAt  time.Time `json:"authored_at"`
	CommittedAt time.Time `json:"committed_at"`
	Parents     []string  `json:"parents"`
}

// CacheSize bounds the object cache of a repository opened for one request.
const CacheSize = 8 << 20

// Repo is an open repository.
type Repo struct {
	r *git.Repository
	// closer releases the files of a repository opened from disk
	closer io.Closer
}

// Open opens the bare repository at path, with a small object cache: each
// request opens its own.
func Open(path string) (*Repo, error) {
	r, err := gitstore.Open(path, CacheSize)
	if err != nil {
		return nil, fmt.Errorf("browse: %w", err)
	}
	return &Repo{r: r.Repository, closer: r}, nil
}

// Close releases the repository's open files.
func (b *Repo) Close() error {
	if b.closer != nil {
		return b.closer.Close()
	}
	return nil
}

// CleanPath checks a path inside the repository and returns it without
// surrounding slashes; "" is the root. It rejects anything but plain
// slash-separated names: no "." or ".." segments, empty segments,
// backslashes, or control characters.
func CleanPath(p string) (string, error) {
	if len(p) > MaxPath {
		return "", ErrBadPath
	}
	p = strings.Trim(p, "/")
	if p == "" {
		return "", nil
	}
	for _, r := range p {
		if r < 0x20 || r == 0x7f || r == '\\' {
			return "", ErrBadPath
		}
	}
	if !utf8.ValidString(p) {
		return "", ErrBadPath
	}
	for _, seg := range strings.Split(p, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return "", ErrBadPath
		}
	}
	return p, nil
}

// validRef reports whether ref looks like a branch or tag name, following
// git's ref name rules where they matter: no "..", "//", "@{", or a trailing
// "/", ".", or ".lock".
func validRef(ref string) bool {
	if !refPattern.MatchString(ref) {
		return false
	}
	return !strings.Contains(ref, "..") &&
		!strings.Contains(ref, "//") &&
		!strings.Contains(ref, "/.") &&
		!strings.HasSuffix(ref, "/") &&
		!strings.HasSuffix(ref, ".") &&
		!strings.HasSuffix(ref, ".lock")
}

// Refs returns the branches and tags, sorted by name.
func (b *Repo) Refs() (Refs, error) {
	var out Refs
	if head, err := b.r.Storer.Reference(plumbing.HEAD); err == nil && head.Type() == plumbing.SymbolicReference && head.Target().IsBranch() {
		out.Head = head.Target().Short()
	}
	iter, err := b.r.References()
	if err != nil {
		return Refs{}, fmt.Errorf("browse: listing refs: %w", err)
	}
	err = iter.ForEach(func(ref *plumbing.Reference) error {
		if ref.Type() != plumbing.HashReference {
			return nil
		}
		switch {
		case ref.Name().IsBranch():
			out.Branches = append(out.Branches, Ref{Name: ref.Name().Short(), Commit: ref.Hash().String()})
		case ref.Name().IsTag():
			c, err := b.peel(ref.Hash())
			if err != nil {
				// A tag on something other than a commit (a tree or blob)
				return nil
			}
			out.Tags = append(out.Tags, Ref{Name: ref.Name().Short(), Commit: c.Hash.String()})
		}
		return nil
	})
	if err != nil {
		return Refs{}, fmt.Errorf("browse: reading refs: %w", err)
	}
	sort.Slice(out.Branches, func(i, j int) bool { return out.Branches[i].Name < out.Branches[j].Name })
	sort.Slice(out.Tags, func(i, j int) bool { return out.Tags[i].Name < out.Tags[j].Name })
	return out, nil
}

// Resolve returns the commit a ref names: a branch, then a tag, then a full
// 40-character commit hash. "" is HEAD. Revision syntax such as "main~2" isn't
// accepted.
func (b *Repo) Resolve(ref string) (*object.Commit, error) {
	if ref == "" {
		head, err := b.r.Head()
		if err != nil {
			return nil, ErrNotFound
		}
		return b.commit(head.Hash())
	}
	if hashPattern.MatchString(ref) {
		return b.commit(plumbing.NewHash(ref))
	}
	if !validRef(ref) {
		return nil, ErrBadRef
	}
	if r, err := b.r.Storer.Reference(plumbing.NewBranchReferenceName(ref)); err == nil {
		return b.commit(r.Hash())
	}
	if r, err := b.r.Storer.Reference(plumbing.NewTagReferenceName(ref)); err == nil {
		return b.peel(r.Hash())
	}
	return nil, ErrNotFound
}

func (b *Repo) commit(h plumbing.Hash) (*object.Commit, error) {
	c, err := b.r.CommitObject(h)
	if errors.Is(err, plumbing.ErrObjectNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("browse: reading commit: %w", err)
	}
	return c, nil
}

// peel follows annotated tags down to their commit.
func (b *Repo) peel(h plumbing.Hash) (*object.Commit, error) {
	for range 10 {
		tag, err := b.r.TagObject(h)
		if errors.Is(err, plumbing.ErrObjectNotFound) {
			// Not a tag object: a lightweight tag points straight at the commit
			return b.commit(h)
		}
		if err != nil {
			return nil, fmt.Errorf("browse: reading tag: %w", err)
		}
		h = tag.Target
	}
	return nil, ErrNotFound
}

// Tree lists the directory at path in the commit ref names, directories
// first, then by name.
func (b *Repo) Tree(ref, path string) (*object.Commit, []Entry, error) {
	path, err := CleanPath(path)
	if err != nil {
		return nil, nil, err
	}
	c, err := b.Resolve(ref)
	if err != nil {
		return nil, nil, err
	}
	root, err := c.Tree()
	if err != nil {
		return nil, nil, fmt.Errorf("browse: reading tree: %w", err)
	}
	tree := root
	if path != "" {
		e, err := root.FindEntry(path)
		if err != nil {
			return nil, nil, notFound(err)
		}
		if e.Mode != filemode.Dir {
			return nil, nil, ErrNotDir
		}
		if tree, err = root.Tree(path); err != nil {
			return nil, nil, notFound(err)
		}
	}

	entries := make([]Entry, 0, len(tree.Entries))
	for _, e := range tree.Entries {
		full := e.Name
		if path != "" {
			full = path + "/" + e.Name
		}
		out := Entry{Name: e.Name, Path: full, Type: typeOf(e.Mode), Executable: e.Mode == filemode.Executable}
		if out.Type == "file" || out.Type == "symlink" {
			// Not Storer.EncodedObjectSize: in go-git v5.19.3 it leaves a loose
			// object's file open (it closes the zlib reader, not the file).
			if blob, err := b.r.BlobObject(e.Hash); err == nil {
				out.Size = blob.Size
			}
		}
		entries = append(entries, out)
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if (entries[i].Type == "dir") != (entries[j].Type == "dir") {
			return entries[i].Type == "dir"
		}
		return entries[i].Name < entries[j].Name
	})
	return c, entries, nil
}

// File reads the file at path in the commit ref names. Content is returned
// only for text files of at most maxSize bytes.
func (b *Repo) File(ref, path string, maxSize int64) (*object.Commit, File, error) {
	path, err := CleanPath(path)
	if err != nil {
		return nil, File{}, err
	}
	if path == "" {
		return nil, File{}, ErrNotFile
	}
	c, err := b.Resolve(ref)
	if err != nil {
		return nil, File{}, err
	}
	root, err := c.Tree()
	if err != nil {
		return nil, File{}, fmt.Errorf("browse: reading tree: %w", err)
	}
	e, err := root.FindEntry(path)
	if err != nil {
		return nil, File{}, notFound(err)
	}
	typ := typeOf(e.Mode)
	if typ != "file" && typ != "symlink" {
		return nil, File{}, ErrNotFile
	}
	blob, err := b.r.BlobObject(e.Hash)
	if err != nil {
		return nil, File{}, notFound(err)
	}
	f := File{Path: path, Type: typ, Size: blob.Size, Executable: e.Mode == filemode.Executable}

	if typ == "symlink" {
		// A symlink's blob is its target path. Reported, never followed.
		target, err := readBlob(blob, MaxPath)
		if err != nil {
			return nil, File{}, err
		}
		f.Target = string(target)
		return c, f, nil
	}
	if blob.Size > maxSize {
		f.TooLarge = true
		return c, f, nil
	}
	content, err := readBlob(blob, maxSize)
	if err != nil {
		return nil, File{}, err
	}
	if isBinary(content) {
		f.Binary = true
		return c, f, nil
	}
	f.Content = string(content)
	return c, f, nil
}

// Log returns one page of the history of the commit ref names, newest first,
// limited to commits that touch path when it isn't "". more is true when
// there's a next page.
func (b *Repo) Log(ref, path string, page, perPage int) (commits []Commit, more bool, err error) {
	path, err = CleanPath(path)
	if err != nil {
		return nil, false, err
	}
	if page < 1 || perPage < 1 {
		return nil, false, errors.New("browse: page and perPage start at 1")
	}
	c, err := b.Resolve(ref)
	if err != nil {
		return nil, false, err
	}
	opts := &git.LogOptions{From: c.Hash, Order: git.LogOrderCommitterTime}
	if path != "" {
		opts.FileName = &path
	}
	iter, err := b.r.Log(opts)
	if err != nil {
		return nil, false, fmt.Errorf("browse: reading history: %w", err)
	}
	defer iter.Close()

	skip := (page - 1) * perPage
	for {
		c, err := iter.Next()
		if errors.Is(err, io.EOF) {
			return commits, false, nil
		}
		if err != nil {
			return nil, false, fmt.Errorf("browse: reading history: %w", err)
		}
		if skip > 0 {
			skip--
			continue
		}
		if len(commits) == perPage {
			return commits, true, nil
		}
		commits = append(commits, toCommit(c))
	}
}

func toCommit(c *object.Commit) Commit {
	parents := make([]string, 0, len(c.ParentHashes))
	for _, p := range c.ParentHashes {
		parents = append(parents, p.String())
	}
	summary, _, _ := strings.Cut(strings.TrimSpace(c.Message), "\n")
	return Commit{
		Hash:        c.Hash.String(),
		Summary:     strings.TrimSpace(summary),
		Message:     c.Message,
		AuthorName:  c.Author.Name,
		AuthorEmail: c.Author.Email,
		AuthoredAt:  c.Author.When.UTC(),
		CommittedAt: c.Committer.When.UTC(),
		Parents:     parents,
	}
}

func typeOf(m filemode.FileMode) string {
	switch m {
	case filemode.Dir:
		return "dir"
	case filemode.Symlink:
		return "symlink"
	case filemode.Submodule:
		return "submodule"
	default:
		return "file"
	}
}

func readBlob(blob *object.Blob, limit int64) ([]byte, error) {
	rd, err := blob.Reader()
	if err != nil {
		return nil, fmt.Errorf("browse: reading file: %w", err)
	}
	defer func() { _ = rd.Close() }()
	content, err := io.ReadAll(io.LimitReader(rd, limit))
	if err != nil {
		return nil, fmt.Errorf("browse: reading file: %w", err)
	}
	return content, nil
}

// isBinary treats content as binary when its start has a NUL byte (git's own
// test) or it isn't valid UTF-8, since only text is returned.
func isBinary(content []byte) bool {
	return bytes.IndexByte(content[:min(len(content), binarySniff)], 0) >= 0 || !utf8.Valid(content)
}

// notFound maps go-git's lookup errors to ErrNotFound.
func notFound(err error) error {
	if errors.Is(err, object.ErrEntryNotFound) || errors.Is(err, object.ErrDirectoryNotFound) ||
		errors.Is(err, object.ErrFileNotFound) || errors.Is(err, plumbing.ErrObjectNotFound) {
		return ErrNotFound
	}
	return fmt.Errorf("browse: %w", err)
}
