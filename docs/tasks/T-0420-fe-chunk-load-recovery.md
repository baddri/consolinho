---
id: T-0420
title: Chunk-load recovery — "A new version of FleetConsole is available" instead of a generic error
status: todo
owner: frontend-engineer
checkpoint: 6b
depends_on: []
paths: [web/src/app/RouteErrorPage.tsx, web/src/app/RouteErrorPage.test.tsx, web/src/shared/routing, docs/architecture/FRONTEND.md]
review_rounds: 0
---

## Goal
After a redeploy, a stale tab requests lazy chunks that no longer exist and lands on the generic "An error occurred"
page (T-0028 review ruling 5). Recover once automatically, then show a clear PF alert. Spec CP6 **CL-1, CL-2**, Q7 (size **S**).

## Scope
- In: chunk-error detection, one guarded auto-reload per session, alert in the route error element, FRONTEND.md note.
- Out: OCP-style per-import retry with backoff (`async.tsx:withRetry`), service workers, e2e (T-0426).

## Contract / design notes
- `web/src/shared/routing/chunkLoad.ts` (exported from `shared/routing`):
  - `isChunkLoadError(error: unknown): boolean` — `TypeError`/`Error` whose message matches Chromium "Failed to fetch
    dynamically imported module", Firefox "error loading dynamically imported module", Safari "Importing a module script
    failed", or Vite's preload helper "Unable to preload CSS" (table test).
  - `reloadOnceForNewVersion(storage = sessionStorage, reload = () => location.reload()): boolean` — if key
    `fleetconsole.chunkReloadAt` is absent or older than 10 min, sets it to `Date.now()`, calls `reload`, returns `true`;
    else `false`. Injected deps keep it unit-testable (no `window` mocks).
- `RouteErrorPage`: when `isChunkLoadError(error)`, a `useEffect` calls `reloadOnceForNewVersion()`; while it returns
  `false` (or until the reload happens) render `NewVersionAlert`: PF `Alert variant="warning" isInline` title
  "A new version of FleetConsole is available. Reload to continue." with `actionLinks={<AlertActionLink onClick={reload}>Reload</AlertActionLink>}`
  inside the existing `PageSection` (UX notes §5; no modal). Other errors unchanged.
- Q7 (dirty forms): a failed lazy route load happens during navigation, after `UnsavedChangesGuard`'s blocker already
  asked; so the one auto-reload cannot drop unconfirmed edits. State this in the TSDoc.
- No `vite:preloadError` listener: Vite rethrows the preload failure into the import, which reaches this element.

## Context pack
- Touch points: `web/src/app/RouteErrorPage.tsx:RouteErrorPage` (33 lines, whole file); `web/src/app/router.tsx`
  (errorElement at L18, L22 — unchanged); `web/src/features/resources/yaml/UnsavedChangesGuard.tsx` (blocker, read only).
- Test: memory router whose lazy route rejects with `new TypeError('Failed to fetch dynamically imported module: /assets/x.js')`;
  `src/test/coldStart.ts` helpers if a full-app render is used.
- OCP reference: no direct counterpart; `/home/bad/works/openshift-console/frontend/public/components/utils/async.tsx:withRetry`
  (L29-58) for context, `public/components/error.tsx` for the page frame.

## Acceptance criteria
- [ ] CL-1: mocked import failure renders the alert with a Reload action, never a blank page (RTL test).
- [ ] CL-2: first failure calls `reload` once; a second failure within 10 min shows the alert without reloading (unit test).
- [ ] Non-chunk errors still render "An error occurred" (existing behaviour, test).
- [ ] FRONTEND.md § UI conventions: one bullet. TSDoc. Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
