# Security model

FleetConsole holds ServiceAccount tokens for ~40 clusters. A compromise of the console is a compromise of every token
it holds, so these rules are strict.

## Authentication (users → FleetConsole) — ADR-0007
- Login via the **host cluster's OpenShift OAuth server** (authorization code + PKCE, scope `user:info`), handled
  server-side. Identity = `users/~` on the host API server. The OCP access token is discarded right after; never stored.
- `state`/PKCE validated by the ASP.NET OAuth handler; redirect URI fixed by configuration (no open redirects; the
  post-login `returnUrl` must be a local path).
- Session: FleetConsole cookie, `HttpOnly`, `Secure`, `SameSite=Lax` (needed for the OAuth callback), sliding
  expiration (8h default), revalidated against the DB on a short interval so deactivating a user takes effect quickly.
- Admins bootstrapped from config (`Auth:BootstrapAdminUsers`, `Auth:AdminGroups`). Auto-provisioning of new users is configurable.
- Dev uses the in-repo OCP OAuth emulator (`FleetConsole.DevOAuth`); it must never be deployed (not in the container image).

## CSRF
- `SameSite=Lax` + every non-GET `/api` request must carry `X-Console-Request: 1` (forces a CORS preflight; no CORS
  is enabled, so cross-site requests can't send it).
- WebSocket upgrades (exec/logs) validate the `Origin` header against the configured public URL.

## Authorization
- `/api/admin/*` requires role `Admin` (endpoint policy **and** `AuthorizationBehavior` in the pipeline).
- Proxy: user must have an active grant for the cluster; the grant's credential must exist and the cluster be enabled.
- MutationGuard policy enforces `ReadOnly` grants and globally read-only users **before** forwarding.
- The cluster's own RBAC (on the SA) still applies afterwards — FleetConsole can only narrow, never widen, access.

## Token handling
- SA tokens are encrypted at rest with ASP.NET Data Protection (purpose `FleetConsole.Credentials.v1`); key ring
  persisted in Postgres and, in production, encrypted with a certificate/secret mounted from OpenShift.
- Tokens are **write-only** through the API: create/rotate accepts a token; reads return only fingerprint, expiry
  (decoded from JWT `exp` when present), last verified time.
- Tokens are never logged. Logging enrichers/redaction remove `Authorization` headers; proxy logs record path and status only.
- Decrypted tokens live only for the duration of a request (and, if caching is added, in a short-TTL in-memory cache only).

## Proxy hardening
- Strip from client requests: `Authorization`, `Cookie`, `Impersonate-User`, `Impersonate-Group`, `Impersonate-Uid`,
  `Impersonate-Extra-*`, `X-Remote-*`, hop-by-hop headers. Never forward the console cookie upstream.
- Strip `Set-Cookie` and `WWW-Authenticate` from upstream responses.
- Path is normalised and must start with `/api`, `/apis`, `/version`, `/openapi`, or `/.well-known`; no `..`, no absolute URLs.
- TLS to clusters validates against the cluster's CA bundle; `SkipTlsVerify` is allowed but flagged loudly in the admin UI.
- Request/response size and timeouts: normal requests time out; watch/log/exec streams are long-lived with idle timeouts.

## Audit
- Admin commands and all proxy mutations (allowed and denied) write `AuditEntry` (user, cluster, verb, path, status, timestamp, correlation id).

## HTTP
- Security headers on SPA: CSP (self + needed workers for Monaco), `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none.
