---
id: T-0104
title: "FE: prove the production build works under the CSP (Monaco YAML tab e2e) + login 'unavailable' copy"
status: done
owner: frontend-engineer
checkpoint: 3
depends_on: [T-0092]
paths: [web/e2e/, web/playwright.config.ts, web/src/features/auth/loginMessage.tsx, web/src/features/auth/, web/src/app/]
review_rounds: 0
---

## Goal
The Api now sends a strict CSP (ADR-0029, T-0092). Prove the **built** SPA, including the lazily loaded Monaco YAML
editor, runs under it with zero violations, and fix anything in `web/` that violates it. Also adopt the spec's login
error copy. Spec: HOST-3 (Monaco part), SMK-2 (YAML under CSP, local proxy for it), §5 UX notes.

## Scope
- In: one Playwright spec (+ support helper); minimal SPA fixes if violations appear; `unavailable` login copy + its test.
- Out: backend headers (T-0092); changing the CSP (needs an ADR amendment — raise it, don't work around it).

## Contract / design notes (ADR-0029 §4)
- CSP (contract, set by the Api on every response): `default-src 'self'; script-src 'self'; style-src 'self'
  'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; worker-src 'self'; connect-src 'self'; object-src
  'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`. **Do not copy it into `web/`**: the spec reads it
  from a live `/api` response (e.g. the `GET /api/system/info` response header through the Vite proxy) so there is a
  single source of truth.
- Mechanism: the existing e2e stack (aspire, Vite origin = `Console:PublicOrigin`, DevOAuth login). In the spec,
  `page.route` fulfils document and static-asset requests from `web/dist` (production build; fail with a clear
  message if `web/dist/index.html` is missing — run `npm run build` first) adding the CSP header to the document
  response; `/api/**` continues to the network. Collect `securitypolicyviolation` events (via `page.addInitScript`
  listener exposed with `page.exposeFunction`) and console errors mentioning "Content Security Policy".
- Flow: log in (existing `e2e/support/session.ts` helpers), open a resource's YAML tab on the fake cluster
  (`e2e/support/fakeKubeApi.ts`, same pattern as `browse.e2e.ts`), assert the Monaco editor renders text and the
  editor worker loaded; assert zero violations across login, list, details and YAML pages.
- Likely fix if zod 4 probes `new Function`: `z.config({ jitless: true })` once at app start (`web/src/app/`), with a
  comment linking ADR-0029. Do not add `'unsafe-eval'`.
- Login copy (`loginMessage.tsx`, case `unavailable`): "Can't reach the cluster's sign-in service. Ask an administrator
  to check the console's CA bundle." Update its unit test.

## Context pack
- Docs: ADR-0029, ADR-0024 (Monaco worker setup), FRONTEND.md testing section (grep `^#`).
- Exemplars: `web/e2e/browse.e2e.ts` (login + navigate + fake cluster), `web/e2e/support/session.ts`,
  `web/e2e/support/fakeKubeApi.ts`; `web/playwright.config.ts:L30-50` (baseURL from aspire, serial).
- Touch points: `web/src/features/resources/yaml/monacoSetup.ts:L8-10` (`?worker` editor worker → `worker-src 'self'`);
  `web/src/features/auth/loginMessage.tsx:L41-45`; `web/vite.config.ts` `stripMonacoCdnDefault` (no CDN loads).

## Acceptance criteria
- [x] New e2e passes against the running stack with the production build: YAML tab renders under the CSP, zero CSP
      violations; CSP taken from the Api response, not hard-coded.
- [x] Any SPA change needed for the CSP is minimal and commented with ADR-0029.
- [x] `unavailable` login copy matches the spec; unit test updated.
- [x] Build, lint and tests green (CLAUDE.md rule 4: `scripts/check-fe.sh`) + the new e2e run (result in work log)

## Work log
- 2026-11-21 frontend-engineer: started.
- 2026-11-21 frontend-engineer: e2e found the built SPA crashing at boot (vendor-patternfly maxSize chunk cycle) and
  zod's `new Function` probe (script-src 'eval'); fixed both SPA-side. `npx playwright test` 7/7 passed (csp.e2e.ts
  included); `scripts/check-fe.sh` green. Login `unavailable` copy + LoginPage test updated.

## Review
- 2026-11-21 frontend-architect: **APPROVE** (round 1). `scripts/check-fe.sh` green (693 tests, build ok).
- Ruling (1) `web/vite.config.ts` `strictExecutionOrder: true` (outside paths): accepted. Correct, documented Rolldown fix
  for cross-chunk cycles; it also protects the `maxSize`-split `vendor-monaco` parts. Cost measured: total JS 5.33 →
  5.50 MB (+3%), `vendor-patternfly` main part gzip 148 → 162 kB. Alternative (own leaf group for
  `@patternfly/react-styles`, or drop PF `maxSize`) is more fragile; not required. Comment is accurate.
- Ruling (2) zod `jitless`: correct. Single zod copy (`npm ls`), shared `globalConfig`; `zodConfig` is main.tsx's first
  import and strict execution order guarantees it evaluates first; lazy chunks load later. e2e confirms zero `eval` reports.
- Ruling (3) post-callback page not served from `dist`: acceptable. The 302 target is the same `index.html`;
  `reloadFromBuild` re-serves it under the CSP, and the login page itself is covered (client-side redirect from `/c/...`).
- Nit (optional): web/src/app/zodConfig.ts:1-3 — zod reads `jitless`/probes eval when `z.object()` is *constructed*
  (schemas.js `const jit = !globalConfig.jitless`), not "on the first object parse" — reword so nobody moves the import
  below a module with top-level schemas.
- Nit (optional): web/e2e/support/productionBuild.ts:46 — only a *missing* `dist` fails; a stale build is tested
  silently. Consider noting "run `npm run build` first" in the e2e run instructions / handover.

## Handover notes
- `web/e2e/csp.e2e.ts` + `e2e/support/productionBuild.ts`: CSP read from `GET /api/system/info`; `page.route` serves
  `web/dist` (needs `npm run build` first) with that CSP on every response; `/api/**` goes to the stack. Violations
  from `securitypolicyviolation` events + console errors; asserts editor worker `/assets/editor.worker-*.js` started.
- Redirect targets bypass Playwright routes, so after the OAuth login chain the spec reloads (`reloadFromBuild`).
- Bug found outside task paths (fixed, flag in review): `web/vite.config.ts` — `vendor-patternfly` `maxSize` parts
  imported each other cyclically; production SPA died at boot (`D.modifiers` of PF Table styles undefined). Fix:
  Rolldown `output.strictExecutionOrder: true`. Removing `maxSize` also works (one 527 kB chunk, size warning).
- CSP violation found: `script-src` blocked `eval` = zod 4 JIT probe. Fix: `web/src/app/zodConfig.ts`
  (`z.config({ jitless: true })`, imported first in main.tsx). Monaco + worker: no violations. CSP unchanged.
