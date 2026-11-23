---
id: T-0187
title: "bug: Edit <Kind> stays enabled for read-only users (ACT-4)"
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: []
paths: [web/src/features/resources/actions, web/e2e/workloads.e2e.ts]
review_rounds: 0
---

## Goal
Spec ACT-4 requires every mutating action to be aria-disabled with the reason for a user without the verb. "Edit <Kind>"
(e.g. "Edit Deployment") is never gated, so a read-only user gets an enabled write action. Found by T-0186 e2e.

## Repro
1. `aspire start --launch-profile http`; register a cluster, grant alice `readOnly` (or use dev seed prod-k8s-1).
2. As alice open a Deployment's details › Actions.
- Expected: "Edit Deployment" aria-disabled with "Your access to <cluster> is read-only." (OCP
  `packages/console-app/src/actions/hooks/useCommonActions.ts` L93-97 gates it on `update`).
- Actual: enabled; it opens the YAML tab. The other items (Edit labels, Delete, ...) are correctly disabled.

## Suspected location
`web/src/features/resources/actions/useResourceActions.tsx` — the `edit` item has no `useActionAccess` (the TSDoc says
"always enabled, the tab explains read-only itself", which contradicts ACT-4 and OCP). Add an `update` access gate.

## Acceptance criteria
- [ ] "Edit <Kind>" is aria-disabled with the read-only reason when `update` is denied; enabled otherwise.
- [ ] Remove `test.fixme` from `ACT-4: Edit Deployment is aria-disabled for a read-only user` in `web/e2e/workloads.e2e.ts`; it passes.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
