---
id: T-0219
title: RC "Cancel rollout" action + Search ≤6 concurrent requests test (CP4b follow-ups)
status: done
owner: frontend-engineer
checkpoint: CP4c
depends_on: []
paths: [web/src/features/resources/workloads/replicationcontrollers/, web/src/features/resources/search/useSearchResults.test.ts, web/src/features/resources/search/useSearchResults.ts, docs/architecture/ocp-parity.md]
review_rounds: 1
---

## Goal
Two small §4b.8 follow-ups:
- OCP's "Cancel rollout" on a DeploymentConfig's ReplicationController while its rollout is in progress.
- The SRCH-5 unit test proving Search issues at most 6 list requests at once.

## Scope
- In:
  - The kind action and the confirm modal on RCs (details actions + list kebab, via the existing `useReplicationControllerActions`).
  - Its tests.
  - Removing the "RC Cancel rollout deferred" deviation from the parity row.
  - The concurrency test (production code changes only if the test exposes a bug).
- Out: DC-level cancel (OCP has none on the DC).

## Contract / design notes
- Visible only when the `openshift.io/deployment.phase` annotation is New, Pending or Running (OCP provider), placed after Edit count.
- Access is `patch` on the RC (`useResourceAccess`). When denied, show the usual `isAriaDisabled` + reason.
- Confirm: OCP warning modal. Title "Cancel rollout", body "Are you sure you want to cancel this rollout?", confirm "Yes, cancel", cancel "No, don't cancel". The fleet body line (object in namespace on cluster + environment label) follows §5 "Modals".
- Mutation: one JSON Patch (ADR-0037) that adds the annotations `openshift.io/deployment.cancelled: "true"` and `openshift.io/deployment.status-reason: "cancelled by the user"`. Success/failure toast follows the existing action convention.
- SRCH-5 test: with MSW handlers that hold their responses on a deferred promise, select > 6 kinds and assert that at most 6 requests are in flight at any time, and that all of them eventually render.

## Context pack
- Touch points:
  - `web/src/features/resources/workloads/replicationcontrollers/useReplicationControllerActions.tsx:useReplicationControllerActions` (L24; `deploymentPhaseOf` from `replicationControllerDetails.tsx`).
  - `web/src/features/resources/search/useSearchResults.ts:9` (`pLimit(6)`).
- Exemplars:
  - A confirm + JSON Patch kind action: `web/src/features/resources/workloads/deployments/useDeploymentActions.tsx` (Pause/Resume) and `useDeploymentRollout.ts`.
  - Tests: `standaloneControllers.test.tsx`.
- OCP reference (`/home/bad/works/openshift-console/frontend/`):
  - `packages/console-app/src/actions/hooks/useReplicationControllerActions.ts` L44-95.
  - `packages/console-app/src/actions/providers/replication-controllers-provider.ts` L15-40.

## Acceptance criteria
- [x] An RC in phase Running shows Cancel rollout. Confirming sends exactly the two-annotation JSON Patch; an RC in phase Complete has no such item; RO shows it disabled with the reason (tests).
- [x] SRCH-5: the concurrency test proves at most 6 requests are in flight.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-24 frontend-engineer: "Cancel rollout" item (after Edit Pod count, phase New/Pending/Running, `patch` RC
  review gated by `enabled`) + `CancelRolloutModal` (PF Modal, warning icon, OCP copy, `ClusterContextText` line,
  inline error) + `useCancelRollout` (2-op JSON Patch). SRCH-5 test holds MSW list responses; no prod change needed.
  Parity row updated. Probe can't click, so modal not probed; audit cell probed only (T-0220).

## Review
**UX round 1 — CHANGES_REQUESTED** (code read; OCP `console-app/src/actions/hooks/useReplicationControllerActions.ts` L44-66, `console-shared/src/hooks/useWarningModal.tsx` → component-groups `WarningModal`)
- OK: title, body, "Yes, cancel" primary + "No, don't cancel" link, order, `small`, warning icon, one close X, placement after Edit count (`replication-controllers-provider.ts` L35-38), New/Pending/Running gate.
- CancelRolloutModal footer — `<Flex spaceItemsSm>` gives 8px between buttons; OCP's WarningModal passes `actions` to the PF Modal, so the buttons sit directly in `.pf-v6-c-modal-box__footer` with `margin-inline-end: --pf-t--global--spacer--gap--action-to-action--default` (= spacer--md, 16px) — fix: drop the Flex, put both Buttons directly in `ModalFooter`, and fix the comment (it cites `ModalFooterWithAlerts`, which this modal doesn't use).

## Handover notes
- Files: `workloads/replicationcontrollers/{CancelRolloutModal.tsx,useCancelRollout.ts,useReplicationControllerActions.tsx}`.
- Shared `ConfirmModal` has no cancel-label prop, so the modal is a small PF Modal mirroring OCP `WarningModal`.
- Tests: `standaloneControllers.test.tsx` "Cancel rollout (T-0219)"; `search/useSearchResults.test.ts` SRCH-5.

- 2026-11-24 orchestrator round 2: UX finding applied verbatim (one-line fix), scoped tests 63/63 + eslint green → APPROVE.
