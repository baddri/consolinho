# 0029 — HTTP security headers and the Content-Security-Policy
**Status:** Accepted (2026-11-21) · builds on ADR-0006, 0024 · CP3 spec HOST-3; SECURITY.md "HTTP"; T-0092

## Context
The Api serves the SPA in Production (ADR-0028) and sent no security headers. ADR-0024 bundles Monaco with a Vite
`?worker` editor worker and needs runtime `<style>` injection. Same-origin only: no CDN, no third-party scripts.

## Decision
1. **One middleware** (`Api/Http/SecurityHeadersMiddleware`, registered right after `UseExceptionHandler`) sets these
   headers on **every** response — SPA document, static assets, API JSON, ProblemDetails, probes and proxied
   Kubernetes responses (overwriting any upstream value) — via `Response.OnStarting`, so they survive error handlers
   and YARP header copying. Values are constants in code, not configuration (no operator downgrade path).

   | Header | Value |
   |---|---|
   | `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
   | `X-Content-Type-Options` | `nosniff` |
   | `Referrer-Policy` | `no-referrer` |
   | `X-Frame-Options` | `DENY` (legacy twin of `frame-ancestors`) |
   | `Cross-Origin-Opener-Policy` | `same-origin` |

   The CSP string above is the **contract**; the backend test pins it exactly.
2. **Why each relaxation**: `style-src 'unsafe-inline'` — Monaco injects `<style>` elements at runtime (React's `style`
   prop is CSSOM and needs no relaxation). `img-src`/`font-src data:` — PatternFly CSS uses data-URI SVGs; small fonts
   may be inlined by Vite. `worker-src 'self'` — the Monaco editor worker is a same-origin file (no `blob:`).
   Scripts stay `'self'` only: no inline scripts, no `eval`.
3. **HSTS is not set by the app** (it sees HTTP); the Route adds it (ADR-0030).
4. **Verification of the SPA under the CSP** (frontend task): a Playwright spec serves the production build
   (`web/dist`) for document/asset requests while `/api` goes to the running stack, applying the CSP **read from a
   live `/api` response** (single source of truth, no copy of the string in `web/`), opens the YAML tab and asserts
   Monaco renders with zero `securitypolicyviolation` events. Libraries that probe `eval` (zod 4 JIT) must be
   configured not to (e.g. `z.config({ jitless: true })`) if they trigger violations.

## Consequences
- Any future external origin (telemetry endpoint in the browser, CDN fonts) needs an ADR amending this policy.
- No reporting endpoint (`report-to`) in CP3.
