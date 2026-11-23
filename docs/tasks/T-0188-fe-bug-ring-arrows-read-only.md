---
id: T-0188
title: "bug: Pod ring shows disabled scale arrows to read-only users (DEP-5)"
status: done
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
- [x] Read-only users see no ring arrows (or PO decision recorded in the spec + `ocp-parity.md`).
- [x] Remove `test.fixme` from `DEP-5: the ring has no scale arrows for a read-only user` in `web/e2e/workloads.e2e.ts`; it passes.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: arrows render only when `patch deployments/scale` is allowed (`PodRingScale.allowed`,
  OCP `isScalingAllowed`); disabled/tooltip arrow code removed. While the review is pending the arrows are hidden, not
  aria-disabled: showing them disabled would flash them for read-only users. `allowed` is a flag (not omitting `scale`)
  so the ring isn't remounted when the answer arrives. Unit tests updated; e2e `test.fixme` removed.
- 2026-11-23: e2e `ACT-4/DEP-5 …ring cannot scale` asserted the old disabled arrows; now ACT-4 only (+ Edit Deployment).
  `workloads.e2e.ts` 11/11 green against `aspire start --launch-profile http`; check-fe.sh green.

## Review
- 2026-11-23 frontend-architect: **APPROVE** (round 1). Arrows rendered only when allowed = OCP PodRing `isScalingAllowed`;
  required `allowed` flag avoids remount; `useResourceAccess` used directly (details-only, one SSAR); TSDoc accurate.
  Nit (optional): `PodRing.test.tsx` DEP-5 RO waits a fixed 300 ms; waiting on the recorded SSAR response would be deterministic.

## Handover notes
- Permitted users see the arrows appear once the SSAR answers (same as OCP). `PodRingScale.disabled` is gone.
