package browse

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/go-git/go-billy/v5/memfs"
	git "github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/filemode"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/storage/memory"
)

type fixture struct {
	repo    *Repo
	commits []plumbing.Hash // oldest first
}

// newFixture builds a repository with five commits on main, a dev branch,
// a lightweight and an annotated tag, and assorted file types.
func newFixture(t *testing.T) fixture {
	t.Helper()
	fs := memfs.New()
	r, err := git.InitWithOptions(memory.NewStorage(), fs, git.InitOptions{DefaultBranch: plumbing.NewBranchReferenceName("main")})
	if err != nil {
		t.Fatal(err)
	}
	wt, _ := r.Worktree()
	write := func(path, content string) {
		f, err := fs.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = f.Write([]byte(content))
		_ = f.Close()
		if _, err := wt.Add(path); err != nil {
			t.Fatal(err)
		}
	}
	// setMode changes a staged file's mode in the index. The fixture sets the
	// executable bit and symlinks this way so it's the same on every OS (the
	// in-memory filesystem drops the bit and uses \ in symlinks on Windows).
	setMode := func(path string, mode filemode.FileMode) {
		idx, err := r.Storer.Index()
		if err != nil {
			t.Fatal(err)
		}
		e, err := idx.Entry(path)
		if err != nil {
			t.Fatal(err)
		}
		e.Mode = mode
		if err := r.Storer.SetIndex(idx); err != nil {
			t.Fatal(err)
		}
	}
	var fx fixture
	when := time.Unix(1_700_000_000, 0)
	do := func(msg string) {
		when = when.Add(time.Hour)
		h, err := wt.Commit(msg, &git.CommitOptions{Author: &object.Signature{Name: "Ada", Email: "ada@example.com", When: when}})
		if err != nil {
			t.Fatal(err)
		}
		fx.commits = append(fx.commits, h)
	}

	write("README.md", "# hello\n")
	do("Add README\n\nLonger body.")
	write("src/main.go", "package main\n")
	write("src/util/util.go", "package util\n")
	do("Add source")
	write("bin.dat", "PK\x03\x04\x00\x00binary")
	write("latin1.txt", "caf\xe9")
	write("run.sh", "#!/bin/sh\necho hi\n")
	setMode("run.sh", filemode.Executable)
	write("big.txt", strings.Repeat("a", 5000))
	// A symlink's blob is its target path
	write("escape", "../../etc/passwd")
	setMode("escape", filemode.Symlink)
	do("Add assorted files")
	write("README.md", "# hello again\n")
	do("Update README")
	write("src/main.go", "package main\n\nfunc main() {}\n")
	do("Add main")

	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(r.Storer.SetReference(plumbing.NewHashReference("refs/heads/dev", fx.commits[1])))
	_, err = r.CreateTag("v0.1.0", fx.commits[0], nil)
	must(err)
	_, err = r.CreateTag("v0.2.0", fx.commits[2], &git.CreateTagOptions{Message: "release", Tagger: &object.Signature{Name: "Ada", Email: "ada@example.com", When: when}})
	must(err)
	fx.repo = &Repo{r: r}
	return fx
}

func TestCleanPath(t *testing.T) {
	ok := map[string]string{"": "", "/": "", "a": "a", "a/b": "a/b", "/a/b/": "a/b", "dir.with.dots/f": "dir.with.dots/f", "naïve.txt": "naïve.txt"}
	for in, want := range ok {
		if got, err := CleanPath(in); err != nil || got != want {
			t.Errorf("CleanPath(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	bad := []string{"..", "../etc/passwd", "a/../../b", "./a", "a/.", "a//b", `a\b`, `..\..\x`, "a\x00b", "a\nb", "a\x7fb", "\xff", strings.Repeat("a", MaxPath+1)}
	for _, in := range bad {
		if _, err := CleanPath(in); !errors.Is(err, ErrBadPath) {
			t.Errorf("CleanPath(%q) err = %v, want ErrBadPath", in, err)
		}
	}
}

func TestValidRef(t *testing.T) {
	for _, ref := range []string{"main", "feature/x", "v1.2.3", "release-1_0", "user+fix"} {
		if !validRef(ref) {
			t.Errorf("%q rejected", ref)
		}
	}
	for _, ref := range []string{"", "-main", "/main", "main/", "a..b", "a//b", "main~1", "main^", "HEAD@{1}", "x.lock", "x.", "a/.b", "has space", "../x"} {
		if validRef(ref) {
			t.Errorf("%q accepted", ref)
		}
	}
}

func TestRefs(t *testing.T) {
	fx := newFixture(t)
	refs, err := fx.repo.Refs()
	if err != nil {
		t.Fatal(err)
	}
	if refs.Head != "main" {
		t.Errorf("head = %q", refs.Head)
	}
	want := []Ref{{"dev", fx.commits[1].String()}, {"main", fx.commits[4].String()}}
	if len(refs.Branches) != 2 || refs.Branches[0] != want[0] || refs.Branches[1] != want[1] {
		t.Errorf("branches = %v, want %v", refs.Branches, want)
	}
	// The annotated tag is peeled to its commit
	wantTags := []Ref{{"v0.1.0", fx.commits[0].String()}, {"v0.2.0", fx.commits[2].String()}}
	if len(refs.Tags) != 2 || refs.Tags[0] != wantTags[0] || refs.Tags[1] != wantTags[1] {
		t.Errorf("tags = %v, want %v", refs.Tags, wantTags)
	}
}

func TestResolve(t *testing.T) {
	fx := newFixture(t)
	cases := map[string]plumbing.Hash{
		"":                     fx.commits[4],
		"main":                 fx.commits[4],
		"dev":                  fx.commits[1],
		"v0.1.0":               fx.commits[0],
		"v0.2.0":               fx.commits[2],
		fx.commits[3].String(): fx.commits[3],
	}
	for ref, want := range cases {
		c, err := fx.repo.Resolve(ref)
		if err != nil || c.Hash != want {
			t.Errorf("Resolve(%q) = %v, %v; want %s", ref, c, err, want)
		}
	}
	for ref, want := range map[string]error{
		"nope":                     ErrNotFound,
		strings.Repeat("0", 40):    ErrNotFound,
		"main~1":                   ErrBadRef,
		"../main":                  ErrBadRef,
		fx.commits[3].String()[:7]: ErrNotFound, // short hashes aren't accepted
	} {
		if _, err := fx.repo.Resolve(ref); !errors.Is(err, want) {
			t.Errorf("Resolve(%q) err = %v, want %v", ref, err, want)
		}
	}
}

func TestTree(t *testing.T) {
	fx := newFixture(t)
	c, entries, err := fx.repo.Tree("main", "")
	if err != nil {
		t.Fatal(err)
	}
	if c.Hash != fx.commits[4] {
		t.Errorf("commit = %s", c.Hash)
	}
	var names []string
	types := map[string]Entry{}
	for _, e := range entries {
		names = append(names, e.Name)
		types[e.Name] = e
	}
	if got := strings.Join(names, ","); got != "src,README.md,big.txt,bin.dat,escape,latin1.txt,run.sh" {
		t.Errorf("order = %s (want directories first, then by name)", got)
	}
	if types["src"].Type != "dir" || types["escape"].Type != "symlink" || types["README.md"].Type != "file" {
		t.Errorf("types = %+v", types)
	}
	if types["big.txt"].Size != 5000 || !types["run.sh"].Executable || types["README.md"].Executable {
		t.Errorf("size/executable wrong: %+v", types)
	}

	_, sub, err := fx.repo.Tree("main", "/src/")
	if err != nil || len(sub) != 2 || sub[0].Path != "src/util" || sub[1].Path != "src/main.go" {
		t.Errorf("src = %+v, %v", sub, err)
	}
	for path, want := range map[string]error{
		"README.md":        ErrNotDir,
		"missing":          ErrNotFound,
		"src/missing/deep": ErrNotFound,
		"../":              ErrBadPath,
		"src/../..":        ErrBadPath,
	} {
		if _, _, err := fx.repo.Tree("main", path); !errors.Is(err, want) {
			t.Errorf("Tree(%q) err = %v, want %v", path, err, want)
		}
	}
	// An older commit has fewer files
	if _, old, _ := fx.repo.Tree("v0.1.0", ""); len(old) != 1 {
		t.Errorf("v0.1.0 has %d entries, want 1", len(old))
	}
}

func TestFile(t *testing.T) {
	fx := newFixture(t)
	get := func(path string, limit int64) File {
		t.Helper()
		_, f, err := fx.repo.File("main", path, limit)
		if err != nil {
			t.Fatalf("File(%q): %v", path, err)
		}
		return f
	}

	if f := get("README.md", 1<<20); f.Content != "# hello again\n" || f.Binary || f.TooLarge || f.Type != "file" {
		t.Errorf("README = %+v", f)
	}
	if f := get("bin.dat", 1<<20); !f.Binary || f.Content != "" {
		t.Errorf("bin.dat = %+v, want binary without content", f)
	}
	if f := get("latin1.txt", 1<<20); !f.Binary || f.Content != "" {
		t.Errorf("invalid UTF-8 = %+v, want binary", f)
	}
	if f := get("big.txt", 1000); !f.TooLarge || f.Content != "" || f.Size != 5000 {
		t.Errorf("big.txt = %+v, want too large", f)
	}
	if f := get("run.sh", 1<<20); !f.Executable {
		t.Errorf("run.sh not executable: %+v", f)
	}
	if f := get("escape", 1<<20); f.Type != "symlink" || f.Target != "../../etc/passwd" || f.Content != "" {
		t.Errorf("symlink = %+v, want its target and no content", f)
	}
	if _, f, err := fx.repo.File("v0.1.0", "README.md", 1<<20); err != nil || f.Content != "# hello\n" {
		t.Errorf("README at v0.1.0 = %q, %v", f.Content, err)
	}
	for path, want := range map[string]error{
		"":                 ErrNotFile,
		"src":              ErrNotFile,
		"missing.txt":      ErrNotFound,
		"../../etc/passwd": ErrBadPath,
		"src/../README.md": ErrBadPath,
	} {
		if _, _, err := fx.repo.File("main", path, 1<<20); !errors.Is(err, want) {
			t.Errorf("File(%q) err = %v, want %v", path, err, want)
		}
	}
}

func TestLog(t *testing.T) {
	fx := newFixture(t)
	page1, more, err := fx.repo.Log("main", "", 1, 2)
	if err != nil || len(page1) != 2 || !more {
		t.Fatalf("page 1 = %d commits, more %v, err %v", len(page1), more, err)
	}
	if page1[0].Hash != fx.commits[4].String() || page1[1].Hash != fx.commits[3].String() {
		t.Errorf("page 1 = %s, %s (want newest first)", page1[0].Hash, page1[1].Hash)
	}
	page3, more, _ := fx.repo.Log("main", "", 3, 2)
	if len(page3) != 1 || more || page3[0].Hash != fx.commits[0].String() {
		t.Errorf("page 3 = %+v, more %v", page3, more)
	}
	if first := page3[0]; first.Summary != "Add README" || !strings.Contains(first.Message, "Longer body.") || len(first.Parents) != 0 || first.AuthorName != "Ada" {
		t.Errorf("first commit = %+v", first)
	}

	readme, _, err := fx.repo.Log("main", "README.md", 1, 10)
	if err != nil || len(readme) != 2 {
		t.Fatalf("README history = %d commits, %v; want 2", len(readme), err)
	}
	if _, _, err := fx.repo.Log("main", "../x", 1, 10); !errors.Is(err, ErrBadPath) {
		t.Errorf("bad path err = %v", err)
	}
	if _, _, err := fx.repo.Log("main", "", 0, 10); err == nil {
		t.Error("page 0 accepted")
	}
}

func TestFiles(t *testing.T) {
	fx := newFixture(t)
	c, paths, truncated, err := fx.repo.Files("main", 100)
	if err != nil {
		t.Fatal(err)
	}
	if c.Hash != fx.commits[4] || truncated {
		t.Errorf("commit %s, truncated %v", c.Hash, truncated)
	}
	want := "README.md,big.txt,bin.dat,escape,latin1.txt,run.sh,src/main.go,src/util/util.go"
	if got := strings.Join(paths, ","); got != want {
		t.Errorf("paths = %s\nwant    %s", got, want)
	}

	_, paths, truncated, err = fx.repo.Files("main", 3)
	if err != nil || len(paths) != 3 || !truncated {
		t.Errorf("limited: %v, truncated %v, %v", paths, truncated, err)
	}
	if _, old, _, _ := fx.repo.Files("v0.1.0", 100); strings.Join(old, ",") != "README.md" {
		t.Errorf("v0.1.0 = %v", old)
	}
	if _, _, _, err := fx.repo.Files("no-such-branch", 100); !errors.Is(err, ErrNotFound) {
		t.Errorf("missing ref: %v", err)
	}
	if _, _, _, err := fx.repo.Files("../x", 100); !errors.Is(err, ErrBadRef) {
		t.Errorf("bad ref: %v", err)
	}
}
