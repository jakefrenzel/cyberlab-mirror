# cyberlab-mirror web

The front end of [cyberlab-mirror](../README.md): a Next.js 16 app that signs in through the [`atlasopsec/auth`](https://github.com/atlasopsec/auth) module and browses the mirror read-only.

It starts from the auth module's Next.js template (`templates/nextjs`, **version 0.1.0**, for auth `v1.0.0`, as shipped in its `v1.0.1` tag). Files copied from it begin with a comment saying so, and the changes below are marked `cyberlab-mirror:` in the code.

## Pages

| Path                                     | What it shows                                                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/repos`                                 | Every repository with its sync state, last sync, size, and the last error for failed ones. **Sync now** starts a sync              |
| `/repos/{name}?ref=&path=`               | A folder: directories first, then files, symlinks, and submodules. A picker switches between branches and tags, without JavaScript |
| `/repos/{name}/blob?ref=&path=`          | A file's text. Binary and large files show why they aren't shown; a symlink shows its target and is never followed                 |
| `/repos/{name}/commits?ref=&path=&page=` | History, 30 commits a page, optionally for one file. Each commit links to the files at that commit                                 |
| `/login`, `/sign-up`, `/account`, …      | The template's auth pages, unchanged                                                                                               |

Every page under `/repos` and `/account` calls `requireSession`, which checks the session with the API on each request. The API checks the email allowlist on every call too.

## Security

- **File contents are only ever text.** They're a text child of a `<pre>`, which React escapes, so a file full of `<script>` or `<img onerror>` is shown and never runs. A test renders such files and checks that no elements appear. There is no `dangerouslySetInnerHTML` anywhere.
- **Content Security Policy with a nonce per response** ([`src/proxy.ts`](src/proxy.ts)). Scripts run only with that response's nonce, and `'strict-dynamic'` lets those load the rest of Next.js. The policy also sets `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` (plus GitHub's sign-in page when GitHub sign-in is on), and `frame-ancestors 'none'`.
- **Every page renders per request.** Cache Components and partial prerendering are off, because both serve a static shell built ahead of time, and its scripts can't carry a per-request nonce. CI checks that every script on the auth pages carries the response's nonce.
- **Other headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, cross-origin opener and resource policies, a restrictive `Permissions-Policy`, and no `X-Powered-By`.
- **The session cookie** is the template's `__Host-session`: `HttpOnly`, `Secure`, `SameSite=Lax`. Browsers treat `localhost` as secure, so it works through `kubectl port-forward`.

## Changes from the template

- **`CLIENT_IP_HEADER=none`.** The template forwards the browser's IP from a header its hosting edge sets. Behind `kubectl port-forward` there is no edge, so the header would be whatever the browser claims. `none` forwards no IP, and the API records the web pod as the client.
- **No mobile OAuth callback, no Playwright end-to-end tests.** There's no mobile app. The template's e2e tests start the auth module's example API, which isn't in this repository.
- **`/repos` instead of `/dashboard`** after login.
- **`vitest.config.mts`** builds the `server-only` alias path with `fileURLToPath`. The template's `URL.pathname` breaks on Windows paths with spaces.
- **Docker:** `output: "standalone"` on a distroless Node.js 24 image, with `sharp` (37 MB of native image libraries, unused here) left out.

## Settings

| Variable           | Example                           |                                                     |
| ------------------ | --------------------------------- | --------------------------------------------------- |
| `API_URL`          | `http://cyberlab-mirror-api:8080` | Required                                            |
| `CLIENT_IP_HEADER` | `none`                            | `none` without a trusted edge (default `x-real-ip`) |
| `OAUTH_PROVIDERS`  | `github`                          | The providers turned on in the API                  |

## Development

Node.js 24 (`.node-version`). The test tools need zstd in `zlib`, which Node 22 only has from 22.15.

```bash
pnpm install
cp .env.example .env.local      # API_URL pointing at a running API
pnpm dev
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test
```
