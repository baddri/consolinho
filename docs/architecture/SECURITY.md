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
  The first DP key is created under a Postgres advisory lock so all replicas share one ring (ADR-0030 amendment); a
  pod stays unready (`keyring` check) until it has loaded the ring.
- Tokens are **write-only** through the API: create/rotate accepts a token; reads return only fingerprint, token type,
  SA identity/`iat`/`exp` (decoded from the JWT payload **without** signature validation, display only), last test
  summary. Integration tests scan every admin GET response, the audit log and captured logs for the token (CRED-2).
- Inside the Application layer tokens travel as `SensitiveString` (`ToString()` → `[redacted]`), so a command record's
  generated `ToString` can never print one. Validation messages never echo the token.
- Connection tests (TEST-*) decrypt the token for the duration of the request only; just a summary (outcome, failed
  step, capability headline, time) is stored. Testing an unsaved token stores nothing but an audit entry with its
  fingerprint.
- Tokens are never logged. Logging enrichers/redaction remove `Authorization` headers; proxy logs record path and status only.
- Request URLs can carry secrets in the query (OAuth callback `code`/`state`). ASP.NET Core's request-line log
  (`Microsoft.AspNetCore.Hosting.Diagnostics`, Information) quotes the full URL. It must stay off in production: the category
  is capped at Warning in code outside Development for every logging provider, so no configuration can re-enable it;
  OpenTelemetry's default `url.query` redaction stays on (ADR-0028 §4).
  The OAuth handler's own loggers are capped at Warning in code (`WarningOnlyLoggerFactory`, ADR-0018), so the remote
  `error_description` is never logged.
- FleetConsole's **own host SA token** (ADR-0039 §5) is used for one call only: listing host groups
  (`get`/`list groups.user.openshift.io`, ClusterRole `consolinho-group-reader`, nothing else). In-cluster it is a
  projected token (1 h, rotated by the kubelet) mounted into the server container only, never automounted; the app
  re-reads the file on every refresh and never stores or logs it. `Auth:HostGroups:Token` (inline) is Development only.
- Decrypted tokens live only for the duration of a request (and, if caching is added, in a short-TTL in-memory cache only).

## Proxy hardening
- Strip from client requests: `Authorization`, `Proxy-Authorization`, `Cookie`, `X-Console-Request`, `Forwarded`,
  `Impersonate-*`, `X-Remote-*`, `X-Forwarded-*`, hop-by-hop headers; then add exactly one `Authorization: Bearer
  <grant SA token>`. Never forward the console cookie upstream (ADR-0020).
- Strip `Set-Cookie` and `WWW-Authenticate` from upstream responses. Upstream 401 becomes 502
  `Proxy.CredentialRejected`, so a bad SA token never logs the user out.
- Path: the raw request target is validated, never rewritten: must start with `/api`, `/apis`, `/version`,
  `/openapi`, or `/.well-known`; `..`/`.` segments, `//`, `\`, `%2e`/`%2f`/`%5c` and absolute URLs → 400 (ADR-0019).
- Mutations (any method but GET/HEAD/OPTIONS, plus `exec`/`attach`/`portforward`/`proxy` subresources; SSAR/SSRR POSTs
  excepted) are refused for read-only users and ReadOnly grants before forwarding. WebSocket upgrades need a matching
  `Origin`.
- TLS to clusters validates against the cluster's CA bundle (only that cluster's pool uses it); `SkipTlsVerify` is
  allowed but flagged loudly in the admin UI.
- Limits: non-streaming requests idle-time out (30 s → 504); watches are capped at `timeoutSeconds` 300, which also
  bounds how long a revoked user's open read stream lives; every other stream has a hard lifetime enforced by the
  endpoint (ADR-0036): followed logs end at the stream lifetime (watch cap + `Proxy:StreamIdleSlack` 30 s = 330 s),
  exec/attach sessions at `Proxy:ExecSessionCap` (60 min; never cut for idling before). Both re-authorize on reconnect, so revocation,
  deactivation and cluster disable reach open streams at the next cap; mutation bodies ≤ 10 MiB (413).
- Access is resolved per request (no cache in CP2): revoking a grant, deactivating a user or disabling a cluster takes
  effect on the next request.

## Audit
- Admin commands and all proxy mutations (allowed and denied) write `AuditEntry` (user, cluster, verb, path, status, timestamp, correlation id).
  Proxy entries are written after the response in their own unit of work; a failed audit write is logged at Error and
  does not affect the response (ADR-0021). GETs/watches/log reads are not audited (traces only). Exec/attach sessions
  are audited **at the handshake** (before any frame is relayed, so an open shell always has its entry) with the
  container; the exec `command` is never recorded or logged. The session's end is a log line with duration and cause
  (`cap` | `client` | `upstream`), not a second entry (ADR-0036 §3–5).
- Admin-action audit entries are written **in the same database transaction** as the change (ADR-0008): no change
  without its entry, no entry without its change. Auth events (login, login denied with reason, logout) are audited too.
- Append-only: no API updates or deletes entries. Entries never contain tokens, OAuth codes or cookie values (fingerprints
  only); CA bundle content is not logged, only the names of changed fields.

## HTTP
- Security headers on **every** response (SPA, assets, API, proxied responses), constants in code (ADR-0029): CSP
  `default-src 'self'` with `style-src 'unsafe-inline'` (Monaco), `worker-src 'self'`, `frame-ancestors 'none'`;
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
  `Cross-Origin-Opener-Policy: same-origin`.
- TLS ends at the OpenShift Route (edge, HTTP→HTTPS redirect, HSTS from the router; ADR-0030). The app trusts no
  forwarded headers; cookies are `Secure` by policy and URLs come from `Console:PublicOrigin` (ADR-0028).
- Deployment: non-root arbitrary UID, read-only root filesystem, no SA token automount, pod SA without RBAC,
  NetworkPolicies (ingress only from the router; egress by port). The Data Protection certificate is mandatory outside
  Development; losing it or the `data_protection_keys` table makes every stored SA token unreadable (runbook).
