---
id: T-0054
title: Playwright smoke — login deep link, logout, switcher labels, no-grants landing
status: done
owner: qa-engineer
checkpoint: 2
depends_on: [T-0061, T-0073]
paths: [web/e2e/, web/playwright.config.ts, web/package.json]
review_rounds: 1
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
- [x] H1–H4 run green headless against a locally started stack.
- [x] Re-runnable on a non-empty dev database.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 qa: Playwright 1.65.1 (Chromium), `web/e2e/*.e2e.ts` (H1–H4 + QG-4 Pods list via real proxy to an in-process
  HTTPS fake kube API), admin-API seeding/cleanup in global setup; `npm run e2e` (README). 5 passed, 1 fixme, twice in a row
  on the non-empty dev DB; check-fe green. QG-4 YAML-tab step is `test.fixme` until T-0075 (details page is a placeholder).
  Setup revokes bob/admin grants (H4 precondition). Also touched: tsconfig.node.json, eslint ignores, root .gitignore.
- 2026-11-20 qa (round 1 fixes): H4 now uses new DevOAuth users `e2e-user`/`e2e-admin` (src/FleetConsole.DevOAuth/appsettings.json,
  DevOAuthAuthorizeTests count 5→7); setup seeds as `e2e-admin` and revokes only those two users' grants. Nits done (H1 origin
  predicate, H2 2 s, config cwd from import.meta.url, README openssl). e2e 5 passed/1 fixme ×2 (+1 run from repo root with -c);
  check-fe, check-be green.
- 2026-11-20 qa: ff-merged T-0075; QG-4 YAML step is now a real test (pod link → YAML tab → `kind: Pod` in the read-only
  panel, no Save); fake API serves the pod GET. e2e 6 passed ×2; check-fe green.

## Review
**APPROVE** (frontend-architect, round 2). check-fe green (56 files / 632 tests, build ok). Round-1 finding resolved: setup and
H4 use only the reserved DevOAuth users `e2e-user`/`e2e-admin` (appended after the demo users, so picker order and
the demo flows are unchanged; DevOAuthAuthorizeTests updated 5→7 forms, no other test counts users); `bob`/`admin`
grants are never touched. Nits applied (H1 origin predicate, 2 s negative wait, `import.meta.url` cwd, README).
The QG-4 YAML step is now real; its 15 s timeout is on a `toHaveURL` condition (not a sleep), and the assertions are
scoped to the YAML tab panel.

Round 1 — **CHANGES_REQUESTED** (frontend-architect). Static review; check-fe green in the worktree (55 files / 618 tests, build ok).
- web/e2e/global-setup.ts:58,94 — setup silently revokes **every** grant of `bob` and `admin` in the developer's dev DB (destroys their manual setup; against Scope "not the persistent dev DB", R6) — use dedicated grantless e2e identities instead: add DevOAuth users `e2e-user` (no groups) and `e2e-admin` (group `fleetconsole-admins`, admin via `Auth:AdminGroups`) to `src/FleetConsole.DevOAuth/appsettings.json`, use them in H4 (`DevUser` type + README), and revoke grants only of those e2e-owned users (never `bob`/`admin`); update the README warning and the playwright.config.ts:31 comment.
Accepted: fake HTTPS kube API on 127.0.0.1 with a throw-away cert + `skipTlsVerify` dev cluster, `e2e-smoke-*` leftover cleanup and teardown; fake JWT obviously fake and canonical base64url; base URL from `aspire describe web` with `E2E_BASE_URL` override; `*.e2e.ts` outside the Vitest glob, linted, typechecked via tsconfig.node.json; QG-4 YAML step `fixme` until T-0075.
H4 wording: "Go to Fleet administration" is right — CP1-acceptance.md:35 (T-0053 rename) supersedes the QA report's older "Go to Administration".
Nits (optional):
- web/e2e/auth.e2e.ts:20 — `waitForURL(!/api/)` could also match the DevOAuth page; use the setup's predicate (own origin, not `/login`) for robustness.
- web/e2e/auth.e2e.ts:38 — the fixed 5 s `waitForTimeout` is a deliberate negative check from the spec; 2 s would do and keeps the suite fast.
- web/playwright.config.ts:16 — `cwd: '..'` depends on the process cwd; resolve from `import.meta.url` so `npx playwright test -c web/...` from the repo root works.
- README.md e2e section — mention that `openssl` must be on PATH (fake API certificate).

## Handover notes
- Revoked-grants audit (read-only SQL on this worktree's dev DB, volume `fleetconsole.apphost-aff1e2f998-postgres-data`):
  **zero `grant.revoked` entries**. The DB was empty before the first e2e run (admin/bob were first provisioned by it), so
  round 0 revoked nothing. The developer's main-checkout DB is a different Aspire volume and was never touched.
- Run: `aspire start --launch-profile http && aspire wait web`, `cd web && npm run e2e`, `aspire stop`. Needs `openssl`.
- QG-4 YAML step asserts visible text only; when Monaco lands (T-0077) re-check its locator (`tabpanel` "YAML").
