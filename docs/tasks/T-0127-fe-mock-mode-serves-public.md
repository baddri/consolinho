---
id: T-0127
title: Serve web/public in dev:mock too (theme pre-paint script, favicon)
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/vite.config.ts]
review_rounds: 1
---

## Goal
`dev:mock` sets `publicDir` to `msw/`, which replaces `public/`. So `theme-init.js` (T-0119 pre-paint theme classes) and
`favicon.svg` 404 in mock mode, and the theme classes only arrive at mount (flash). Mock mode must serve both.

## Scope
- In: `web/vite.config.ts`. Serve `msw/` in addition to `public/` in mock mode (small plugin or copy), and keep the MSW
  worker out of `dist/`. Fix the outdated comment at `web/vite.config.ts:112-114`.
- Out: anything else.

## Context pack
- Touch points: `web/vite.config.ts` (`publicDir`, `assertNotMockBuild`), `web/public/theme-init.js`, `web/msw/`.

## Acceptance criteria
- [x] In `npm run dev:mock`, `/theme-init.js`, `/favicon.svg` and the MSW worker all load (200).
- [x] `npm run build` output still has no MSW worker.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 frontend-engineer: `publicDir` is `public/` in every mode; new serve-only plugin `serveMswWorker` adds
  `/mockServiceWorker.js` from `msw/` in mock mode. curl on dev:mock: theme-init.js, favicon.svg, worker all 200 (sizes
  match files). `vite build`: dist has favicon.svg + theme-init.js, no worker. Comment at old L112-114 rewritten.

## Review
### Code (frontend-architect)
APPROVE. The worker can reach `dist/` only through `publicDir`, which never points at `msw/`. `serveMswWorker` has
`apply: 'serve'` and is only in the mock plugin list. `assertNotMockBuild` still matters because it keeps the MSW
runtime and fixtures out of the bundle. The middleware is pre-internal, so it runs before the SPA fallback. It sends
`text/javascript` and `no-cache`, and the comments are true.
- Nit (optional): `vite.config.ts` `serveMswWorker`: the `use()` path also matches `/mockServiceWorker.js/...`
  sub-paths. This is harmless.

## Handover notes
- Vite has one `publicDir`; the worker is a 1-file middleware (`apply: 'serve'`, mock plugins only), not a copy.
- `npx msw init` must keep targeting `msw/` (never `public/`), or the worker would ship in `dist/`.
