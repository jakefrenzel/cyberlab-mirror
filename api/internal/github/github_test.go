package github

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestListReposFollowsPagesAndSendsToken(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer secret-token" {
			t.Errorf("Authorization = %q", got)
		}
		if r.URL.Path != "/user/repos" {
			t.Errorf("unexpected request %s", r.URL)
		}
		switch r.URL.Query().Get("page") {
		case "":
			if q := r.URL.Query(); q.Get("affiliation") != "owner" || q.Get("per_page") != "100" {
				t.Errorf("first page query = %s", r.URL.RawQuery)
			}
			w.Header().Set("Link", fmt.Sprintf(`<%s/user/repos?page=2>; rel="next", <%s/user/repos?page=2>; rel="last"`, srv.URL, srv.URL))
			fmt.Fprint(w, `[{"name":"one","full_name":"me/one","clone_url":"https://github.com/me/one.git","default_branch":"main","private":true,"size":12,"description":"first"}]`)
		case "2":
			fmt.Fprint(w, `[{"name":"two","full_name":"me/two","clone_url":"https://github.com/me/two.git","default_branch":"trunk","size":0,"description":null}]`)
		default:
			t.Errorf("unexpected page %q", r.URL.Query().Get("page"))
		}
	}))
	defer srv.Close()

	c, err := New(srv.URL, "secret-token")
	if err != nil {
		t.Fatal(err)
	}
	repos, err := c.ListRepos(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(repos) != 2 {
		t.Fatalf("got %d repos, want 2", len(repos))
	}
	if r := repos[0]; r.Name != "one" || !r.Private || r.Empty || r.Description != "first" || r.DefaultBranch != "main" {
		t.Errorf("repos[0] = %+v", r)
	}
	if r := repos[1]; r.Name != "two" || !r.Empty || r.Description != "" || r.DefaultBranch != "trunk" {
		t.Errorf("repos[1] = %+v", r)
	}
}

func TestListReposRefusesNextPageOnAnotherHost(t *testing.T) {
	var elsewhere atomic.Bool
	other := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		elsewhere.Store(true)
	}))
	defer other.Close()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Link", fmt.Sprintf(`<%s/steal>; rel="next"`, other.URL))
		fmt.Fprint(w, `[]`)
	}))
	defer srv.Close()

	c, _ := New(srv.URL, "secret-token")
	if _, err := c.ListRepos(context.Background()); err == nil || !strings.Contains(err.Error(), "another host") {
		t.Fatalf("err = %v, want refusal", err)
	}
	if elsewhere.Load() {
		t.Error("the other host was called")
	}
}

func TestListReposRefusesRedirects(t *testing.T) {
	var elsewhere atomic.Bool
	other := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		elsewhere.Store(true)
	}))
	defer other.Close()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL, http.StatusFound)
	}))
	defer srv.Close()

	c, _ := New(srv.URL, "secret-token")
	if _, err := c.ListRepos(context.Background()); err == nil {
		t.Fatal("redirect was followed")
	}
	if elsewhere.Load() {
		t.Error("the redirect target was called")
	}
}

func TestListReposSkipsUnsafeNames(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `[{"name":".."},{"name":"a/b"},{"name":"ok.name_1-x"},{"name":"`+strings.Repeat("x", 101)+`"}]`)
	}))
	defer srv.Close()

	c, _ := New(srv.URL, "t")
	repos, err := c.ListRepos(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(repos) != 1 || repos[0].Name != "ok.name_1-x" {
		t.Fatalf("repos = %+v", repos)
	}
}

func TestListReposReportsStatusOnly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "Bad credentials: secret-token", http.StatusUnauthorized)
	}))
	defer srv.Close()

	c, _ := New(srv.URL, "secret-token")
	_, err := c.ListRepos(context.Background())
	if err == nil || !strings.Contains(err.Error(), "401") {
		t.Fatalf("err = %v, want 401", err)
	}
	if strings.Contains(err.Error(), "secret-token") {
		t.Errorf("error leaks the response body: %v", err)
	}
}

func TestNewRequiresHTTPSAndToken(t *testing.T) {
	if _, err := New("http://api.example.com", "t"); err == nil {
		t.Error("plain http accepted")
	}
	if _, err := New(DefaultBaseURL, ""); err == nil {
		t.Error("empty token accepted")
	}
}
