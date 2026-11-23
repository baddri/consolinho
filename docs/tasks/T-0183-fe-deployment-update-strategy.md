---
id: T-0183
title: Deployment "Edit update strategy" modal
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0182]
paths: [web/src/features/resources/workloads/deployments/ConfigureUpdateStrategyModal.tsx, web/src/features/resources/workloads/deployments/ConfigureUpdateStrategyModal.test.tsx, web/src/features/resources/workloads/deployments/useDeploymentActions.tsx]
review_rounds: 0
---

## Goal
DEP-8: OCP's "Edit update strategy" modal for Deployments.

## Contract / design notes
- OCP `configure-update-strategy-modal.tsx`: `Radio` "RollingUpdate" (help "The rolling update strategy …" — copy
  OCP's text) with "Max unavailable" / "Max surge" `TextInput`s (int or percent, zod `/^\d+%?$/`), and "Recreate"
  (help per OCP). Item after "Edit Pod count"; gating `patch deployments`.
- Patch: `replace /spec/strategy` with `{ type: 'Recreate' }` or `{ type: 'RollingUpdate', rollingUpdate: { maxUnavailable, maxSurge } }`
  (numbers stay numbers, `25%` stays string). react-hook-form + zod; on `ResourceMutationModal`.

## Context pack
- Exemplars: T-0182 `ConfigureCountModal` (same shell/mutation).
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/modals/configure-update-strategy-modal.tsx`.

## Acceptance criteria
- [ ] DEP-8: modal prefilled from `spec.strategy`; switching to Recreate and saving sends one `replace /spec/strategy` without `rollingUpdate`; invalid values block Save with field error.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
