# Security model

FleetConsole holds ServiceAccount tokens for ~40 clusters. A compromise of the console is a compromise of every token
it holds, so these rules are strict.

## Authentication (users → FleetConsole) — ADR-0007
- Login via the **host cluster's OpenShift OAuth server** (authorization code + PKCE, scope `user:info`), handled
  server-side. Identity = `users/~` on the host API server. The OCP access token is discarded right after; never stored.
- `state`/PKCE validated by the ASP.NET OAuth handler (ADR-0010). Callback `/api/auth/callback`; the `redirect_uri` is
  built from configuration (`Console:PublicOrigin`), never from request headers. The post-login `returnUrl` must be a
  local path (`ReturnUrlPolicy`: single leading `/`, no `//`, `\`, scheme or control characters; else `/`).
- The OCP access token lives only inside the OAuth `OnCreatingTicket` event (wrapped in `SensitiveString`):
  `SaveTokens=false`, never in the cookie, DB or logs (AUTH-3, tested).
- Login failures are redirects to `/login?error=<code>` (`not_registered`, `deactivated`, `cancelled`, `unavailable`,
  `failed`) and are logged with the trace id but never with codes or tokens. Denied logins are audited.
- Session: FleetConsole cookie `FleetConsole.Session`, `HttpOnly`, `Secure` (except the plain-http dev profile),
  `SameSite=Lax` (needed for the OAuth callback), sliding expiration (8h default). Revalidated against the DB every
  `Auth:RevalidationInterval` (60 s): deactivated users and users whose **security stamp** changed (rotated on
  deactivation) are signed out; role/read-only claims are refreshed (ADR-0009). The cookie handler answers challenges
  and forbids with 401/403 ProblemDetails (`Auth.Unauthenticated`/`Auth.Forbidden`) and never redirects — app-wide,
  not only under `/api`: the Api has no login page, and SPA routes, static files and health endpoints never challenge.
  The OAuth login challenge uses the separate `OpenShift` scheme and is unaffected.
- Admins come from two sources (ADR-0009): assigned in the admin UI, or configuration (`Auth:BootstrapAdminUsers`,
  `Auth:AdminGroups`) evaluated **at login only** — removal from the admin group takes effect at the next login; an
  urgent removal is a deactivation. Configuration admins are the recovery path if the last admin is lost.
- Last-admin protection: the last active, non-read-only admin can't be demoted, deactivated or set read-only; admins
  can't demote or deactivate themselves (ADM-5).
- Auto-provisioning of new users is configurable (`Auth:AutoProvision`, default true; provisioned users have no grants).
- Host API/OAuth server TLS: system trust or `Auth:OpenShift:CaBundlePath`; `SkipTlsVerify` is refused outside Development.
  A CA bundle **replaces** system trust for both the API server and the OAuth route, so in cluster it must contain the
  SA `ca.crt` plus the CA that signs the OAuth route (ingress CA, or the public root). Outside Development the host API
  server and the OAuth endpoints (static or discovered) must be `https`: the client secret, codes and access tokens
  travel there. The `openshift-host` HTTP client has no retries (authorization codes are single-use).
- Dev uses the in-repo OCP OAuth emulator (`FleetConsole.DevOAuth`); it must never be deployed (not in the container
  image; the Api must not reference it — architecture test). Its client secret is an obviously fake dev value.

## CSRF
- `SameSite=Lax` + every `/api` request with a method other than GET/HEAD/OPTIONS must carry
  `X-Console-Request: 1` (forces a CORS preflight; no CORS is enabled, so cross-site requests can't send it).
  Enforced by `CsrfHeaderMiddleware` **before** authentication and before any endpoint runs (body binding), for all such requests
  including anonymous endpoints and unknown routes → 403 `Auth.CsrfHeaderMissing` (ADR-0012). The exemption list is
  deliberately minimal (TRACE, CONNECT and any other method need the header). GET endpoints must therefore stay
  side-effect free.
- WebSocket upgrades (exec/logs) validate the `Origin` header against the configured public URL.

## Authorization
- Every `/api` endpoint requires a session except the ADR-0012 list: `GET /api/auth/login`, `GET /api/auth/callback`,
  `POST /api/auth/logout`, `GET /api/system/info` (build version + environment name only; kept anonymous for the login
  page footer — revisit in CP6). A test enumerates endpoints to keep this list exact.
- `/api/admin/*` requires role `Admin` (endpoint policy **and** `AuthorizationBehavior` in the pipeline).
- Globally read-only users: admin **commands** are refused (`Auth.ReadOnly`, `ReadOnlyGuardBehavior`); admin queries
  and the audit log stay readable (auditor persona). From CP2 the proxy also enforces it.
- Role Admin grants no cluster access; admins need grants like everyone else.
- Proxy: user must have an active grant for the cluster; the grant's credential must exist and the cluster be enabled.
- MutationGuard policy enforces `ReadOnly` grants and globally read-only users **before** forwarding.
- The cluster's own RBAC (on the SA) still applies afterwards — FleetConsole can only narrow, never widen, access.

## Token handling
- SA tokens are encrypted at rest with ASP.NET Data Protection (purpose `FleetConsole.Credentials.v1`); key ring
  persisted in Postgres and, in production, encrypted with a certificate/secret mounted from OpenShift.
- Tokens are **write-only** through the API: create/rotate accepts a token; reads return only fingerprint, token type,
  SA identity/`iat`/`exp` (decoded from the JWT payload **without** signature validation, display only), last test
  summary. Integration tests scan every admin GET response, the audit log and captured logs for the token (CRED-2).
- Inside the Application layer tokens travel as `SensitiveString` (`ToString()` → `[redacted]`), so a command record's
  generated `ToString` can never print one. Validation messages never echo the token.
- Connection tests (TEST-*) decrypt the token for the duration of the request only; just a summary (outcome, failed
  step, capability headline, time) is stored. Testing an unsaved token stores nothing but an audit entry with its
  fingerprint.
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
- Admin-action audit entries are written **in the same database transaction** as the change (ADR-0008): no change
  without its entry, no entry without its change. Auth events (login, login denied with reason, logout) are audited too.
- Append-only: no API updates or deletes entries. Entries never contain tokens, OAuth codes or cookie values (fingerprints
  only); CA bundle content is not logged, only the names of changed fields.

## HTTP
- Security headers on SPA: CSP (self + needed workers for Monaco), `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none.
