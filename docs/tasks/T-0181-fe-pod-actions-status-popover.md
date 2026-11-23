---
id: T-0181
title: Pod kebab actions and the OCP pod status popover
status: todo
owner: frontend-engineer
checkpoint: 4a
depends_on: [T-0175, T-0177]
paths: [web/src/features/resources/registry/kinds/pods.tsx, web/src/features/resources/registry/kinds/pods.test.tsx, web/src/features/resources/workloads/pods]
review_rounds: 0
---

## Goal
DEP-1, DEP-2 (Q6 accepted: OCP status popover): Pod row/details kebab = Edit labels, Edit annotations, Edit Pod,
Delete Pod (common set, no kind items, as OCP); the Status column shows OCP's popover for problem states with
"View logs" / "View events" links.

## Scope
- In: `workloads/pods/PodStatus.tsx` + `PodStatusPopover.tsx` + test; pods descriptor uses it for the Status column
  and the details summary status.
- Out: debug-container link (OCP has it; out of CP4a scope per spec).

## Contract / design notes
- `PodStatus({ pod, cluster })`: computed by the existing `podStatus()` (pods.tsx L18). For `CrashLoopBackOff`,
  `ErrImagePull`, `ImagePullBackOff`, `Error`, `Failed`, `OOMKilled` etc. (OCP `pod-list.tsx` L236-340 list) render a PF
  `Popover` trigger (`Button variant="link" isInline` with the status icon + text, as OCP `PodStatusPopover` L223);
  body = container `state.waiting.message` / `terminated.reason` text + `Link`s "View logs" →
  `resourcePath(..., { tab: 'logs', search: { container } })` and "View events" → events tab. Other states keep
  `ResourceStatusLabel`.
- Kebab: verify after T-0176/T-0177 the generic set already matches OCP pod-provider; only a test here.

## Context pack
- Exemplars: `registry/kinds/pods.tsx:podStatus` L18 and the Status column; `shared/ui` `ResourceStatusLabel`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/pod-list.tsx` L223 `PodStatusPopover`,
  L236-340 `PodStatus`; `packages/console-app/src/actions/providers` pod provider (grep `usePodActions`).

## Acceptance criteria
- [ ] DEP-1: pod kebab lists Edit labels, Edit annotations, Edit Pod, Delete Pod in that order (test).
- [ ] DEP-2: CrashLoopBackOff row shows a popover with the reason and working "View logs" (opens Logs with that container) / "View events" links (test).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
