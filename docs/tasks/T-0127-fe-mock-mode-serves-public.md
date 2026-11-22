---
id: T-0127
title: Serve web/public in dev:mock too (theme pre-paint script, favicon)
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/vite.config.ts]
review_rounds: 0
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
- [ ] In `npm run dev:mock`, `/theme-init.js`, `/favicon.svg` and the MSW worker all load (200).
- [ ] `npm run build` output still has no MSW worker.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
