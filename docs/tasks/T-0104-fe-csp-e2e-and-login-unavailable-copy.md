---
id: T-0104
title: "FE: prove the production build works under the CSP (Monaco YAML tab e2e) + login 'unavailable' copy"
status: todo
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
- [ ] New e2e passes against the running stack with the production build: YAML tab renders under the CSP, zero CSP
      violations; CSP taken from the Api response, not hard-coded.
- [ ] Any SPA change needed for the CSP is minimal and commented with ADR-0029.
- [ ] `unavailable` login copy matches the spec; unit test updated.
- [ ] Build, lint and tests green (CLAUDE.md rule 4: `scripts/check-fe.sh`) + the new e2e run (result in work log)

## Work log

## Review

## Handover notes
