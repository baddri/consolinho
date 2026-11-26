---
id: T-0422
title: Axe scans of the key pages in light and dark theme, with a findings report
status: todo
owner: qa-engineer
checkpoint: 6b
depends_on: [T-0421]
paths: [web/e2e/a11y.e2e.ts, web/e2e/support/registerCluster.ts, web/e2e/workloads.e2e.ts, docs/tasks]
review_rounds: 0
---

## Goal
Scan the pages named in the spec with axe in both themes, and turn the findings into tasks.
Spec CP6 **A11Y-1, A11Y-4** (measurement; fixes are T-0423) (size **M**).

## Contract / design notes
- Extract the cluster registration of `workloads.e2e.ts` (`beforeAll` L143-176, `addCredential` L771, `grant` L786)
  into `e2e/support/registerCluster.ts:registerFakeCluster(api, { apiUrl, displayName, environment: 'prod'|'dev', grants: { user, readOnly }[] }): Promise<{ name; remove(): Promise<void> }>`;
  `workloads.e2e.ts` calls it (behaviour unchanged). T-0425 reuses it.
- `a11y.e2e.ts`: one fake workloads cluster (`startFakeWorkloadsApi`, environment `prod`, so prod colouring and the
  switcher are scanned) and `test.describe.each`-style loop over themes `light`/`dark` (set
  `localStorage['fleetconsole.theme']` via `addInitScript`). Pages (A11Y-1): login; Fleet overview; Pods list; Deployment
  details + YAML tab + Events tab; Pod Logs tab; an action modal (Edit labels); Fleet admin Users and Clusters lists;
  User Preferences. Each: wait for content, then `scanA11y(page, '<page>-<theme>')`.
- Serious/critical findings fail the spec by design until T-0423 fixes them: mark those `test.fail()` with a
  `// T-0423` comment so the suite stays green, and list them in T-0423's Goal. File one task per moderate rule
  (next free T-number, `checkpoint: backlog`) and note them in the spec's §8 backlog via the orchestrator.

## Context pack
- Helpers: `web/e2e/support/axe.ts:scanA11y` (T-0421); `web/e2e/support/fakeWorkloadsApi.ts:startFakeWorkloadsApi`,
  `DEPLOYMENT`, `POD`, `WORK_NAMESPACE`; `web/e2e/support/session.ts:loginAs`, `CSRF`, `ok`.
- Theme exemplar: `web/e2e/layout.e2e.ts:L47-70` (theme key `fleetconsole.theme`, `emulateMedia`).
- Modal exemplar: `web/e2e/workloads.e2e.ts:L199-221` (ACT-2 Edit labels on a prod cluster).

## Acceptance criteria
- [ ] All A11Y-1 pages scanned in light and dark; `e2e/.results/a11y-report.md` lists every finding by impact.
- [ ] `workloads.e2e.ts` green after the extraction (no behaviour change).
- [ ] Serious/critical list copied into T-0423; moderate rules filed as backlog tasks.
- [ ] `scripts/check-e2e.sh` green (with `test.fail()` markers).

## Work log

## Review

## Handover notes
