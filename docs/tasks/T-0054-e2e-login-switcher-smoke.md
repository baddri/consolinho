---
id: T-0054
title: Playwright smoke — login deep link, logout, switcher labels, no-grants landing
status: todo
owner: qa-engineer
checkpoint: 2
depends_on: [T-0061, T-0073]
paths: [web/e2e/, web/playwright.config.ts, web/package.json]
review_rounds: 0
---

## Goal
CP1 closed with four browser-only checks done by hand (QA report H1–H4: AUTH-2, AUTH-10, SW-2, SW-4; risk R3). CP2
rebuilds the switcher and adds the proxy, so these flows will be touched again. A minimal Playwright smoke against
`aspire start` + DevOAuth turns H1–H4 into a repeatable check before the full e2e suite (ROADMAP CP6). Orchestrator may
re-slot this to CP3 if CP2 is full; it must not slip past the first deployment.

## Scope
- In: Playwright setup (one browser, Chromium), four specs mirroring H1–H4 in `docs/specs/CP1-qa-report.md`
  § Needs-human steps, using the DevOAuth picker users `alice`, `bob`, `admin`; seed data via the admin API, not the
  persistent dev DB (QA risk R6). A script entry (`npm run e2e`) documented in README.
- In (CP2 spec QG-4): one browsing step — grep `QG-4` in `docs/specs/CP2-proxy-and-resource-browser.md` for the exact step
  (needs the real proxy T-0061 and list page T-0073; the cluster can be the fake API server or a stub).
- Out: the full e2e suite, CI wiring decisions (architect), visual regression.

## Contract / design notes
- Tests create their own uniquely named cluster + fake JWT credential + alice ReadOnly grant, and clean up.
- Assert H1's open-redirect case (`returnUrl=https://example.com` → `/`).

## Context pack
- `docs/specs/CP1-qa-report.md` § Needs-human steps (H1–H4), § Risks R3/R6.
- `docs/tasks/T-0043-fe-integration-generated-types.md` Handover notes (fake JWT must be canonical base64url).

## Acceptance criteria
- [ ] H1–H4 run green headless against a locally started stack.
- [ ] Re-runnable on a non-empty dev database.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
