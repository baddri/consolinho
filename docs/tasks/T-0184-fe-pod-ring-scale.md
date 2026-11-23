---
id: T-0184
title: Pod ring scale up/down buttons (debounced)
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0182]
paths: [web/src/features/resources/details/PodRing.tsx, web/src/features/resources/details/PodRing.module.css, web/src/features/resources/details/PodRing.test.tsx, web/src/features/resources/registry/kinds/deployments.tsx]
review_rounds: 0
---

## Goal
DEP-5: OCP's ring arrows on the Deployment details page — click up/down changes the shown target instantly, and a
single scale PATCH is sent 1 s after the last click (ADR-0037 §7, `use-debounce`, flushed on unmount).

## Contract / design notes
- `PodRing` gains optional `scale?: { desired: number; onScale(n: number): void; disabled?: DisabledActionProps }`;
  without it the ring stays read-only (other kinds). Buttons: PF `Button variant="plain"` with `AngleUpIcon` /
  `AngleDownIcon`, aria-labels "Increase the pod count" / "Decrease the pod count" (OCP), down disabled at 0;
  ring title shows the pending count ("scaling to n" — OCP copy) until the watch catches up.
- `deployments.tsx` `DeploymentPodRing` passes `useScaleDeployment` + `useActionAccess(patch deployments/scale)`.
- `useDebouncedCallback(fn, 1000)` and `.flush()` in the unmount cleanup.

## Context pack
- Exemplars: `details/PodRing.tsx` L83 (props {cluster, workload, selector}); `registry/kinds/deployments.tsx` L60, L135.
- OCP reference: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/pod/PodRing.tsx`
  L36 clickCount, L55 debounce, L134-162 buttons.

## Acceptance criteria
- [ ] DEP-5: three quick up-clicks send one PATCH with replicas +3 after ~1 s (fake timers); down disabled at 0.
- [ ] RO/RBAC: arrows aria-disabled with the reason; no PATCH.
- [ ] Unmount during the debounce window still sends the PATCH.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
