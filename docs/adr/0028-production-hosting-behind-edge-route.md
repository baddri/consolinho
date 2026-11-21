# 0028 — Production hosting behind an edge Route: SPA fallback, probes, no forwarded headers, safe logs, fail-fast config
**Status:** Accepted (2026-11-21) · builds on ADR-0006, 0012, 0018 · CP3 spec HOST-1/2/4/5/6, PRB-1..3, CFG-2, Q10

## Context
In Production the Api serves the built SPA, sits behind an OpenShift edge-terminated Route (it sees plain HTTP from the
router) and must be probed by the kubelet. SECURITY.md left a follow-up: the request-line log quotes the full URL
(OAuth `code`/`state`) and only a configurable log level keeps it off.

## Decision
1. **SPA hosting** (all environments; it is inert when `wwwroot` is absent, as under `aspire run`):
   static files from the web root, then an anonymous SPA fallback to `index.html` for `GET`/`HEAD` requests whose path
   is not under `/api` and has no file extension. `/api/**` never falls back, so unknown API paths keep the
   ProblemDetails 404 (ADR-0013). Missing assets (`/assets/x.js`) are a plain 404.
   **Caching**: `index.html` (direct or via fallback) `Cache-Control: no-cache`; files under `/assets/` (Vite's hashed
   output) `Cache-Control: public, max-age=31536000, immutable`; other static files: no explicit header.
2. **Probes** mapped in every environment by `ServiceDefaults.MapDefaultEndpoints`: `GET /alive` (checks tagged `live`;
   only `self` — no DB, no cluster) and `GET /health` (all checks, incl. the Npgsql DbContext check registered by
   `EnrichNpgsqlDbContext`). Body is the plain status word only (default writer: no check names, exceptions or
   versions). Anonymous, outside `/api` (so no CSRF), never served by the SPA fallback. Manifests: startup probe on
   `/alive`, liveness `/alive`, readiness `/health` (ADR-0030).
3. **No forwarded-headers middleware (Q10 deferred to CP6).** Nothing in the app derives URLs, scheme or trust from the
   request: the OAuth `redirect_uri` and every absolute URL come from `Console:PublicOrigin` (ADR-0018); session and
   correlation cookies are `SecurePolicy.Always` outside Development, so they are `Secure` although the app sees HTTP;
   HSTS and HTTP→HTTPS redirect are the Route's job. `AllowedHosts` stays `*` (kubelet probes use the pod IP).
   The audit model records no client IP today; adding one (ForwardedHeaders with `KnownNetworks` from configuration +
   an audit column) is a CP6 backlog item. `UseHttpsRedirection`/`UseHsts` are not used.
4. **Request URLs are never logged outside Development, enforced in code.** A `PostConfigure<LoggerFilterOptions>`
   adds, for the category `Microsoft.AspNetCore.Hosting.Diagnostics`, a `Warning` minimum for the provider-less rule
   **and** for every provider name that appears in any configured rule, so no `Logging:<Provider>:LogLevel` override
   can re-enable the request-line log. OpenTelemetry ASP.NET Core instrumentation (≥ 1.9) already redacts `url.query`
   values; we keep that default and never set `OTEL_DOTNET_EXPERIMENTAL_ASPNETCORE_DISABLE_URL_QUERY_REDACTION`.
5. **Logs**: outside Development the console logger uses the JSON formatter (`AddJsonConsole`, UTC timestamps, scopes
   off) on stdout.
6. **Fail fast on configuration**: every required production setting is an options validation with `ValidateOnStart`
   whose failure message names the key and never the value:
   - `ConnectionStrings:consoledb` present (all environments; still read lazily by the DbContext);
   - `DataProtection:KeyEncryptionCertificatePath` **required outside Development** (CFG-2; replaces
     `UnprotectedKeyRingWarning`), file exists, PKCS#12 loads with the optional password file, has a private key;
     loading happens in options configuration/validation, not at service registration (ADR-0027 §2);
   - optional `DataProtection:PreviousKeyEncryptionCertificatePath` (+ `…PreviousKeyEncryptionCertificatePasswordPath`):
     a retired certificate registered for **decryption only**, so the certificate can be rotated without losing the
     keys it encrypted (OPS-2); validated like the current one when set;
   - existing validators for `Console:PublicOrigin` and `Auth:OpenShift:*` (incl. `CaBundlePath` if set) unchanged.
     `CaBundlePath` stays optional in code (an out-of-cluster deployment with publicly trusted endpoints may omit it);
     the manifests always set it.
   `Program` catches `OptionsValidationException` around `RunAsync`, logs **one Critical line per failure**
   (`Startup configuration error: {Failure}`) and exits with code 1.

## Consequences
- Integration tests run a Production host (WebApplicationFactory, environment `Production`, faked settings: offline
  OAuth, temp DP certificate, temp web root with `index.html` and a hashed asset) for HOST-1/2/3/5 and PRB-1/2.
- `/health` and `/alive` join the anonymous surface (ADR-0012 list/tests).
- If the console is ever run behind a proxy that rewrites paths, revisit (out of scope).

## Amendment (2026-11-21, T-0106) — the database never gates liveness
- The framework's Data Protection hosted service (synchronous key-ring read before Kestrel binds) is removed and
  replaced by `KeyRingWarmupService` (background, failure only logged), via `LoadDataProtectionKeyRingInBackground()`,
  the **last** call before `Build()` (any later `AddDataProtection`/`AddAuthentication` re-adds the blocking service;
  `ProductionProbeTests.KeyRingLoad_IsNotOnTheStartupPath` guards this, the helper throws if the framework type is
  renamed). Key protection is unchanged: the certificate encryptor applies to every load; a first key is created
  encrypted, as before; concurrent first-key creation across replicas is the same benign framework race as before (two
  valid encrypted keys).
- The DbContext readiness check has a 2 s `Timeout` (< the 3 s readiness probe timeout), so `/health` answers 503.
- **Accepted:** during an outage a request that needs the key ring (session cookie) may wait up to ~60 s on EF's
  retries when the ring isn't cached yet (pod started during the outage). No extra bound: such a pod is NotReady, so the
  Service routes no user traffic to it, and `/alive` uses no Data Protection. A pod with a cached ring keeps using it
  while a refresh retries. Revisit if a non-Service client (e.g. direct pod access) ever matters.
