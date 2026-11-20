# 0006 — Single container serves API and SPA
**Status:** Accepted (2026-11-18) · amended by ADR-0026 (base image, build)

## Context
Same-origin simplifies cookies, CSRF, CSP and OpenShift Route config.

## Decision
Production image builds `web/` and copies `dist/` into the Api's `wwwroot`; Api serves static files with SPA fallback for non-`/api` paths. In development, Aspire runs the Vite dev server which proxies `/api` to the Api.

## Consequences
One Deployment, one Route. Frontend and backend release together.
