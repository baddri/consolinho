---
id: T-0188
title: "bug: Pod ring shows disabled scale arrows to read-only users (DEP-5)"
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: []
paths: [web/src/features/resources/registry/kinds/deployments.tsx, web/src/features/resources/components/PodRing.tsx, web/e2e/workloads.e2e.ts]
review_rounds: 0
---

## Goal
Spec DEP-5 says the ring's scale arrows are absent without `patch` on `deployments/scale`, as OCP's
`packages/console-shared/src/components/pod/PodRing.tsx` (renders the arrows only when `isScalingAllowed`). T-0184
renders them aria-disabled with the reason instead. Behaviour is safe (no PATCH is sent — proven by T-0186 e2e), so this
is a parity/spec deviation: fix it, or have the PO amend DEP-5 and record the deviation in `ocp-parity.md`.

## Repro
As a read-only user (alice on prod-k8s-1, or a `readOnly` grant) open a Deployment's details.
- Expected: no "Increase/Decrease the Pod count" buttons.
- Actual: both are rendered with `aria-disabled="true"`.

## Suspected location
`web/src/features/resources/registry/kinds/deployments.tsx:DeploymentPodRing` (passes `disabled: access` instead of
omitting the scale controls).

## Acceptance criteria
- [ ] Read-only users see no ring arrows (or PO decision recorded in the spec + `ocp-parity.md`).
- [ ] Remove `test.fixme` from `DEP-5: the ring has no scale arrows for a read-only user` in `web/e2e/workloads.e2e.ts`; it passes.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
