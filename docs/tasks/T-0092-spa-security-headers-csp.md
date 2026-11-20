---
id: T-0092
title: Security headers (CSP incl. Monaco, nosniff, Referrer-Policy, frame-ancestors) on the Api-served SPA
status: todo
owner: backend-engineer
checkpoint: 3
depends_on: [T-0077]
paths: [src/FleetConsole.Api/, tests/FleetConsole.Api.Tests/, web/e2e/]
review_rounds: 0
---

## Goal
SECURITY.md § HTTP requires security headers on the SPA, and the Api sends none today. The Api does not serve the
SPA yet (dev uses the Vite server), so this lands with CP3's single-container SPA hosting. Filed from the T-0077 review.

## Scope
- In: `Content-Security-Policy` for the SPA document: `default-src 'self'`, `img-src 'self' data:`,
  `worker-src 'self' blob:` only if Monaco needs blob workers (verify), `style-src 'self' 'unsafe-inline'` (Monaco),
  `frame-ancestors 'none'`, `connect-src 'self'`; plus `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer` (or `same-origin`), on SPA and API responses.
- In: e2e that opens the YAML tab with the CSP in force and asserts no CSP violations and no cross-origin requests.
- Out: report-uri / reporting endpoint.

## Acceptance criteria
- [ ] Headers present on `index.html`, static assets and API responses (integration test).
- [ ] YAML tab (Monaco) works under the CSP in e2e; no console CSP violations.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
