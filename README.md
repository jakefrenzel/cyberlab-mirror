# cyberlab-mirror

A private mirror of my GitHub repositories, running in my [homelab cluster](https://github.com/jakefrenzel/cyberlab-infra). It keeps a copy of every repository I own, so losing access to GitHub doesn't mean losing the code. A read-only web UI lets me browse the copies, behind a sign-in from my own auth module, [`atlasopsec/auth`](https://github.com/atlasopsec/auth).

> **Status:** the API (`api/`) is built and tested. The web front end (`web/`, Next.js) is next, then the deployment.

## How it fits together

```
 Browser ──cookie──▶ Next.js (web/) ──Bearer token──▶ Go API (api/) ──▶ PostgreSQL (accounts, sessions)
                                                          │
                                                          ├──▶ GitHub API (list repositories)
                                                          ├──▶ github.com (fetch branches and tags)
                                                          └──▶ /data/repos/<name>.git (bare copies)
```

The browser never talks to the API. The web app holds the session in an `__Host-session` cookie and forwards it as a bearer token, as the auth module is designed to be used.

## Mirroring

- **What's copied:** every repository the token's user owns, as a bare repository with all branches and tags. GitHub's pull request refs are left out.
- **When:** at startup, then every 6 hours (`SYNC_INTERVAL`), or on demand with `POST /v1/syncs`. Four repositories sync at a time.
- **Safe updates:** a first copy is fetched into a temporary directory and renamed into place, so a half-finished clone is never served. Browsing takes a per-repository read lock, so it never sees a fetch in progress.
- **Matches GitHub:** branches deleted or force-pushed on GitHub are deleted or rewritten in the copy. Point-in-time snapshots are a later step.
- **Never deletes:** a repository that disappears from GitHub (or from the token's view) is kept and marked `gone`.
- **Token:** sent only to `api.github.com` and `github.com` over HTTPS, never stored in a copy's git config, and scrubbed from any error message. The GitHub client refuses redirects and pagination links to other hosts.

Mirroring uses [go-git](https://github.com/go-git/go-git), a pure-Go git implementation, so the image needs no `git` binary, shell, or OS packages. go-git has had a steady stream of advisories. Most involve worktrees, SSH, or hostile servers, and this design avoids all three: copies are bare, the only transport is HTTPS, and the only server is GitHub. `govulncheck` and Dependabot watch for new ones.

## Sign-in and the allowlist

Accounts, sessions, email verification, 2FA, rate limits, and "Sign in with GitHub" all come from `atlasopsec/auth`. The mirror adds an allowlist (`ALLOWED_EMAILS`), enforced three times:

1. **Sign-up gate.** A sign-up for an address that isn't on the list gets exactly the module's normal answer (`202 {"verification_required": true}`), and nothing is created. Without the gate, the module's hook would refuse it with a `500`, which tells anyone which addresses are allowed.
2. **`OnUserCreated` hook.** The module refuses to create any account that isn't on the list, so signing up with GitHub is covered too.
3. **Every request.** Mirror routes check the signed-in user's address against the list, so removing someone locks them out at once, even with a live session.

Every route goes through the module's `Protect`, which refuses any route without an access rule.

## API

All routes need a session (`Authorization: Bearer <token>`) for an allowed address. Errors use the auth module's format: `{"error": {"code", "message", "request_id", "details"}}`.

| Route | Returns |
|---|---|
| `GET /v1/repos` | Every repository with its sync state, last success, last error, and size |
| `GET /v1/repos/{name}` | One repository, plus its branches and tags |
| `GET /v1/repos/{name}/tree?ref=&path=` | A directory's entries: directories first, with type, size, and executable bit |
| `GET /v1/repos/{name}/blob?ref=&path=` | A file. Text up to 1 MiB comes back as a JSON string. Binary or larger files return metadata only. Symlinks return their target and are never followed |
| `GET /v1/repos/{name}/commits?ref=&path=&page=` | History, 30 commits per page, optionally only those touching `path` |
| `POST /v1/syncs` | Starts a sync now (`202 {"queued": true}`) |

Plus the module's own endpoints (`/v1/users`, `/v1/sessions`, `/v1/email-verifications`, …).

- **`ref`** is a branch, a tag, or a full 40-character commit hash, and defaults to the default branch. Revision syntax like `main~2` is rejected.
- **`path`** must be a plain relative path. `..` and `.` segments, backslashes, and control characters are rejected. Lookups go through git's object database, not the filesystem, so a path can't leave the repository in any case.

**Ports:** the API listens on `:8080`, for the web app. `/healthz` and `/metrics` are on `:9090`, so the web app can't read metrics and Prometheus can't call the API.

**Headers:** every response carries `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, and an `X-Request-ID` shared with the auth module's errors.

## Configuration

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `GITHUB_TOKEN` | required | Fine-grained token: read-only *Contents* and *Metadata* on the repositories to mirror |
| `APP_URL` | required | The web app's URL, for links in emails |
| `AUTH_ENCRYPTION_KEY` | required | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts 2FA secrets; back it up |
| `RESEND_API_KEY`, `MAIL_FROM` | required | Sends sign-up, verification, and security emails |
| `ALLOWED_EMAILS` | required | Comma-separated addresses that may sign up and use the mirror |
| `TRUSTED_PROXIES` | loopback | CIDRs allowed to forward the client's IP: the web app's pods |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | off | Turn on "Sign in with GitHub" (both or neither) |
| `SYNC_INTERVAL` | `6h` | At least `5m` |
| `DATA_DIR` | `/data/repos` | Where the copies live |
| `LISTEN_ADDR`, `OPS_ADDR` | `:8080`, `:9090` | |
| `MAX_FILE_SIZE` | `1048576` | Largest file whose content is returned |

## Metrics

| Metric | |
|---|---|
| `cyberlab_mirror_repositories{state}` | Repositories by state: `pending`, `ok`, `empty`, `failed`, `gone` |
| `cyberlab_mirror_repository_last_success_timestamp_seconds{repository}` | Last successful sync, per repository |
| `cyberlab_mirror_repository_size_bytes{repository}` | Size of each copy |
| `cyberlab_mirror_repository_sync_failures_total{repository}` | Failed syncs |
| `cyberlab_mirror_sync_runs_total{result}` | Runs: `ok`, `partial`, `list_failed` |
| `cyberlab_mirror_sync_duration_seconds` | How long a full run takes |
| `cyberlab_mirror_last_sync_run_timestamp_seconds` | When the last run finished, for a stale-mirror alert |
| `cyberlab_mirror_build_info{version}` | The running version |

## Development

```bash
cd api
go test -short ./...   # unit tests
go test ./...          # also the end-to-end test against the real auth module and a Postgres container (needs Docker)
golangci-lint run      # v2.15.0, as in CI
```

The end-to-end test signs up, verifies, logs in, browses, gets locked out by the allowlist, and logs out. All of it runs against `atlasopsec/auth` and a real PostgreSQL, with emails captured instead of sent.

CI ([`ci.yml`](.github/workflows/ci.yml)) runs these steps on every push and pull request:

- `go mod verify`, `go vet`, and the tests with `-race`
- golangci-lint (with gosec), govulncheck, and gitleaks
- a Docker build, then a smoke test of the image against a real PostgreSQL
- a Trivy scan that fails on fixable HIGH or CRITICAL vulnerabilities

Actions and base images are pinned to SHAs and digests, and Dependabot proposes updates weekly.

## Releases

Pushing a version tag (`git tag v0.1.0 && git push origin v0.1.0`) runs [`release.yml`](.github/workflows/release.yml):

1. **Build and gate:** the image is built and scanned with Trivy. Nothing is pushed if it has a fixable HIGH or CRITICAL vulnerability.
2. **Publish:** the image goes to `ghcr.io/jakefrenzel/cyberlab-mirror-api`, with SLSA build provenance and an SPDX SBOM.
3. **Sign:** cosign signs the image and attests the SBOM, by digest, keylessly. The certificate names this repository's `release.yml` at the tag, and the signature is recorded in Sigstore's transparency log.
4. **Verify:** both are checked the way the cluster will check them.
5. **Deploy PR:** a pull request in [cyberlab-infra](https://github.com/jakefrenzel/cyberlab-infra) changes the image's tag and digest in `k8s/cyberlab-mirror/kustomization.yaml`. Merging it deploys: Argo CD syncs `main`.

The deploy PR uses a fine-grained token that can only write to cyberlab-infra. It's stored in the `infra-bump` environment, which only releases it to jobs running from a `v*` tag. Everything else in this repository runs with a read-only token.

Verify a release yourself:

```bash
cosign verify ghcr.io/jakefrenzel/cyberlab-mirror-api@sha256:<digest> \
  --certificate-identity https://github.com/jakefrenzel/cyberlab-mirror/.github/workflows/release.yml@refs/tags/v<version> \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```
