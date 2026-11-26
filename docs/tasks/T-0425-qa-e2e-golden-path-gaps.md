---
id: T-0425
title: E2E golden-path gaps — ConfigMap YAML edit, failing pod → logs → events, prod switch, admin grant → user sees cluster
status: todo
owner: qa-engineer
checkpoint: 6b
depends_on: [T-0421, T-0422]
paths: [web/e2e/workloads.e2e.ts, web/e2e/switcher.e2e.ts, web/e2e/fleet.e2e.ts, web/e2e/support]
review_rounds: 0
---

## Goal
Spec CP6 **E2E-2**: extend existing specs (not rewrite) so every golden path is covered (size **M**). Already
covered (do not duplicate): login/logout `auth.e2e.ts` H1/H2; read-only cannot mutate `workloads.e2e.ts` ACT-4 (L688);
scale/restart `workloads.e2e.ts` DEP-4/DEP-6/7 (L222, L258); cluster-named prod confirmation ACT-2 (L199).

## Contract / design notes
Add, each as one `test` in the named file:
1. `workloads.e2e.ts` (RW prod describe): open a ConfigMap's YAML tab, change a `data` value, Save → assert one PUT
   with the new value + `resourceVersion` (`fake.requests`), details show it. Reuse the ConfigMap fixture in
   `fakeWorkloadsApi.ts` (grep `ConfigMap`).
2. `workloads.e2e.ts`: Pods list → `CRASHING_POD` status → Logs tab shows lines → Events tab lists `EVENT`-style warning
   for the pod (extend DEP-2/Q6 L470 flow, not a copy).
3. `switcher.e2e.ts`: switch from a dev to the prod cluster via the switcher; prod colouring class/label visible and the
   URL `:cluster` changes; back to dev removes it.
4. `fleet.e2e.ts` or `groups.e2e.ts`: admin grants `e2e-member` a cluster in the UI → `e2e-member` (new context) sees it
   in the switcher; revoke in `afterAll`. Respect `RESERVED_USERS` rules (`session.ts` L10-16).

## Context pack
- Helpers: `web/e2e/support/registerCluster.ts:registerFakeCluster` (T-0422); `session.ts:loginAs`, `ok`, `CSRF`,
  `deleteCluster`; `fakeWorkloadsApi.ts:RecordedRequest`, `K8sObject`.
- Exemplars: YAML editing `workloads.e2e.ts:editorReady` (L113), `newLineAfter` (L101), QGC-1 Save PUT (L511-538);
  group grant UI `groups.e2e.ts:L70-169`.

## Acceptance criteria
- [ ] Four new tests green in `scripts/check-e2e.sh`; no existing test rewritten.
- [ ] Each test names its spec AC in its title (`E2E-2: ...`).

## Work log

## Review

## Handover notes
