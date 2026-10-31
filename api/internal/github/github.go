// Package github lists the repositories a GitHub token can read, using the
// REST API.
package github

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// DefaultBaseURL is GitHub's REST API.
const DefaultBaseURL = "https://api.github.com"

// maxPages bounds pagination: 50 pages of 100 is 5,000 repositories.
const maxPages = 50

// maxBody bounds one page of the API's answer.
const maxBody = 10 << 20

// validName is what GitHub allows in a repository name. Names are used as
// directory names on disk, so anything else is skipped.
var validName = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)

// Repo is a repository the token can read.
type Repo struct {
	Name          string
	FullName      string
	CloneURL      string
	DefaultBranch string
	Description   string
	Private       bool
	Archived      bool
	Fork          bool
	// Empty is true for a repository with no commits yet.
	Empty    bool
	PushedAt time.Time
}

// Client calls GitHub's REST API with a token.
type Client struct {
	base  *url.URL
	token string
	http  *http.Client
}

// New returns a client for baseURL (DefaultBaseURL in production). The token
// is only ever sent to baseURL's host.
func New(baseURL, token string) (*Client, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("github: parsing base URL: %w", err)
	}
	if u.Scheme != "https" && u.Hostname() != "127.0.0.1" {
		return nil, errors.New("github: base URL must use https")
	}
	if token == "" {
		return nil, errors.New("github: token is required")
	}
	return &Client{
		base:  u,
		token: token,
		http: &http.Client{
			Timeout: 30 * time.Second,
			// The API doesn't redirect these calls. Refusing redirects means
			// the token can't be carried anywhere else.
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return errors.New("github: unexpected redirect")
			},
		},
	}, nil
}

type apiRepo struct {
	Name          string    `json:"name"`
	FullName      string    `json:"full_name"`
	CloneURL      string    `json:"clone_url"`
	DefaultBranch string    `json:"default_branch"`
	Description   *string   `json:"description"`
	Private       bool      `json:"private"`
	Archived      bool      `json:"archived"`
	Fork          bool      `json:"fork"`
	Size          int       `json:"size"`
	PushedAt      time.Time `json:"pushed_at"`
}

// ListRepos returns the repositories owned by the token's user, following
// pagination. Repositories whose names aren't safe as directory names are
// left out.
func (c *Client) ListRepos(ctx context.Context) ([]Repo, error) {
	next := c.base.JoinPath("user", "repos")
	q := next.Query()
	q.Set("affiliation", "owner")
	q.Set("per_page", "100")
	q.Set("sort", "full_name")
	next.RawQuery = q.Encode()

	var repos []Repo
	for page := 0; next != nil; page++ {
		if page == maxPages {
			return nil, fmt.Errorf("github: more than %d pages of repositories", maxPages)
		}
		batch, link, err := c.page(ctx, next)
		if err != nil {
			return nil, err
		}
		for _, r := range batch {
			if !validName.MatchString(r.Name) || r.Name == "." || r.Name == ".." {
				continue
			}
			desc := ""
			if r.Description != nil {
				desc = *r.Description
			}
			repos = append(repos, Repo{
				Name:          r.Name,
				FullName:      r.FullName,
				CloneURL:      r.CloneURL,
				DefaultBranch: r.DefaultBranch,
				Description:   desc,
				Private:       r.Private,
				Archived:      r.Archived,
				Fork:          r.Fork,
				// GitHub reports size 0 for a repository without commits
				Empty:    r.Size == 0,
				PushedAt: r.PushedAt,
			})
		}
		next, err = c.nextPage(link)
		if err != nil {
			return nil, err
		}
	}
	return repos, nil
}

func (c *Client) page(ctx context.Context, u *url.URL) ([]apiRepo, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, "", fmt.Errorf("github: building request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "cyberlab-mirror")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("github: listing repositories: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		// The body can echo request details; only the status is reported.
		return nil, "", fmt.Errorf("github: listing repositories: %s", resp.Status)
	}
	var batch []apiRepo
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBody)).Decode(&batch); err != nil {
		return nil, "", fmt.Errorf("github: decoding repositories: %w", err)
	}
	return batch, resp.Header.Get("Link"), nil
}

// nextPage returns the rel="next" URL from a Link header, or nil on the last
// page. It refuses a next page on any other host than the API's, which would
// receive the token.
func (c *Client) nextPage(link string) (*url.URL, error) {
	for _, part := range strings.Split(link, ",") {
		target, params, ok := strings.Cut(strings.TrimSpace(part), ";")
		if !ok || !strings.Contains(params, `rel="next"`) {
			continue
		}
		target = strings.TrimSpace(target)
		if !strings.HasPrefix(target, "<") || !strings.HasSuffix(target, ">") {
			return nil, errors.New("github: malformed Link header")
		}
		u, err := url.Parse(target[1 : len(target)-1])
		if err != nil {
			return nil, fmt.Errorf("github: parsing next page: %w", err)
		}
		if u.Scheme != c.base.Scheme || u.Host != c.base.Host {
			return nil, fmt.Errorf("github: next page on another host: %s", u.Host)
		}
		return u, nil
	}
	return nil, nil
}
