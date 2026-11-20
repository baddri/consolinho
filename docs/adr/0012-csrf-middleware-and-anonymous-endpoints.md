# 0012 — CSRF header check as middleware; the anonymous API surface
**Status:** Accepted (2026-11-18)

## Context
SECURITY.md requires `X-Console-Request: 1` on every non-GET `/api` request. AUTH-13 adds: rejected with 403
ProblemDetails "before reaching the endpoint, including for anonymous endpoints", tested for POST/PUT/PATCH/DELETE.
BACKEND.md (T-0004) suggested an endpoint filter on the `/api` group. QA R2 asked for the backend check plus a test;
QA R3 asked whether `/api/system/info` stays anonymous.

## Decision
- **Middleware, not endpoint filter.** `Api/Http/CsrfHeaderMiddleware`, registered right after
  `UseStatusCodePages()` and **before** `UseAuthentication()`. For request paths under `/api` (segment match:
  `/api` or `/api/...`) whose method is not GET/HEAD/OPTIONS, it requires header `X-Console-Request` with value
  `1`; otherwise it writes 403 ProblemDetails (`code` `Auth.CsrfHeaderMissing`, `detail` "Missing CSRF header") and
  stops. Why: an endpoint filter runs after routing and parameter binding, so a malformed body without the header gets
  400 instead of 403, and unmatched routes and the OAuth callback middleware are not covered. The middleware is also
  independent of the CP2 proxy endpoint.
- No exemptions. The OAuth callback is a GET; `POST /api/auth/logout` needs the header like everything else.
- **Anonymous API surface** (everything else under `/api` requires an authenticated session via
  `RequireAuthorization()` on the `/api` group; `/api/admin` additionally requires policy `Admin`):
  - `GET /api/auth/login`, `GET /api/auth/callback` (handled by the OAuth middleware), `POST /api/auth/logout`
    (idempotent; 204 even without a session);
  - `GET /api/system/info` — **stays anonymous** (R3): the login page footer shows the build version; the payload is
    the build version and environment name, the same class of information the OCP console exposes anonymously. Revisit
    in CP6 hardening if a deployment wants it hidden.
  An integration test enumerates all mapped `/api` endpoints and asserts that exactly this list allows anonymous access,
  so a new endpoint cannot become anonymous by accident.

## Consequences
- BACKEND.md "HTTP API" convention changes: the CSRF check is middleware; the `/api` group carries authorization.
- `GET` endpoints must stay side-effect free (they are not CSRF-protected). `/api/auth/login` only starts a redirect.

## Amendment (2026-11-19, T-0011 review)
- **Exempt methods are GET/HEAD/OPTIONS only** (as in contract §1). TRACE was listed originally; it is removed so
  the exemption list stays minimal and fails closed: the SPA never sends TRACE, browsers can't, and if a TRACE route
  ever appeared it would be protected like every other unsafe method.
- **Placement, precisely:** minimal hosting's implicit `UseRouting()` *matches* the endpoint before any user
  middleware, so the check does not run "before routing". It runs before authentication and before the endpoint
  executes (binding, filters, handler), which is what the guarantees above rely on.
