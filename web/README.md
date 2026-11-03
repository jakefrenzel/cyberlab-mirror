# cyberlab-mirror web

The front end of [cyberlab-mirror](../README.md): a Next.js 16 app that signs in through the [`atlasopsec/auth`](https://github.com/atlasopsec/auth) module and browses the mirror read-only.

It starts from the auth module's Next.js template (`templates/nextjs`, **version 0.3.0**, as shipped in auth's `v1.2.0` tag; the API runs auth `v1.2.0`). Files copied from it begin with a comment saying so, and the changes below are marked `cyberlab-mirror:` in the code.

## Pages

The design is the dark, tonal redesign (`app/globals.css` holds its colour tokens; Figtree and IBM Plex Mono come from `next/font`, so they're served from this app). One breakpoint, at 760px, switches to the phone layout.

| Path                                | What it shows                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/repos?filter=`                    | Sync health (a count, a bar, and a legend that filters by state), the schedule with **Sync now**, and every repository: failed and gone ones first, each failed one with its error and **Retry** |
| `/repos/{name}?ref=&path=`          | A folder, with a file tree beside it (a drawer on phones). A picker switches between branches and tags                                                                                           |
| `/repos/{name}/blob?ref=&path=#L12` | A file's text with syntax highlighting and line numbers; a line number selects that line and puts it in the URL. Binary and large files say why they aren't shown; a symlink isn't followed      |
| `/repos/{name}/commits?ref=&path=`  | History grouped by day, 30 commits at a time, optionally for one file. Each commit's hash opens the files at that commit                                                                         |
| `/account`                          | Email, password, two-factor authentication, sign-in providers, and sessions                                                                                                                      |
| `/login`, `/sign-up`, …             | The template's auth pages, restyled as one card                                                                                                                                                  |

**⌘K** (or Ctrl+K, or the search pill) opens a palette that jumps to a repository, or to a file in the repository that's open.

Every page under `/repos` and `/account` calls `requireSession`, which checks the session with the API on each request. The API checks the email allowlist on every call too.

## Security

- **File contents are only ever text.** Syntax highlighting runs on the server with [Shiki](https://shiki.style), but only its tokens are used, never its HTML: each token is a text child, which React escapes, so a file full of `<script>` or `<img onerror>` is shown and never runs. Tests render such files, highlighted as HTML, Svelte, Markdown, and TSX, and check that no elements appear. There is no `dangerouslySetInnerHTML` anywhere. Shiki uses its JavaScript regex engine (no WebAssembly), and only the grammars listed in `lib/mirror/highlight.ts` are bundled.
- **Content Security Policy with a nonce per response** ([`src/proxy.ts`](src/proxy.ts)). Scripts run only with that response's nonce, and `'strict-dynamic'` lets those load the rest of Next.js. The policy also sets `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` (plus GitHub's sign-in page when GitHub sign-in is on), and `frame-ancestors 'none'`.
- **Every page renders per request.** Cache Components and partial prerendering are off, because both serve a static shell built ahead of time, and its scripts can't carry a per-request nonce. CI checks that every script on the auth pages carries the response's nonce.
- **Other headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, cross-origin opener and resource policies, a restrictive `Permissions-Policy`, and no `X-Powered-By`.
- **Cookies** are the template's `__Host-session` and `__Host-device`: `HttpOnly`, `Secure`, `SameSite=Lax`. Browsers treat `localhost` as secure, so they work through `kubectl port-forward`. `__Host-device` keeps the device token from the last password login for a year and sends it with the next login, so other people's wrong passwords for the same email don't make this browser wait.

## Changes from the template

- **No mobile OAuth callback, no Playwright end-to-end tests.** There's no mobile app. The template's e2e tests start the auth module's example API, which isn't in this repository.
- **`/repos` instead of `/dashboard`** after login.
- **Docker:** `output: "standalone"` on a distroless Node.js 24 image, with `sharp` (37 MB of native image libraries, unused here) left out.

## Settings

| Variable           | Example                           |                                                     |
| ------------------ | --------------------------------- | --------------------------------------------------- |
| `API_URL`          | `http://cyberlab-mirror-api:8080` | Required                                            |
| `CLIENT_IP_HEADER` | `none`                            | `none` without a trusted edge (default `x-real-ip`) |
| `OAUTH_PROVIDERS`  | `github`                          | The providers turned on in the API                  |

## Development

Node.js 24 (`.node-version`); `engines` allows `^22.22.2 || ^24.15.0 || >=26.0.0`, the versions the test tools (jsdom) work on.

```bash
pnpm install
cp .env.example .env.local      # API_URL pointing at a running API
pnpm dev
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test
```
