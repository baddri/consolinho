---
id: T-0129
title: OCP parity — Timestamp cells, owner links, workload "N of M pods" link
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0121]
paths: [web/src/shared/ui, web/src/features/resources/registry, web/src/features/resources/components]
review_rounds: 0
---

## Goal
Follow-ups from the T-0121 visual review: times, owners and workload status look and link like OCP on every list and
details page.

## Scope
- In: (1) every "Created"/time cell renders like OCP `Timestamp`: `RhUiClockIcon` + absolute date
  ("Nov 17, 2026, 9:54 PM"), relative ("5 minutes ago") only within 10.5 minutes, absolute in a tooltip is no longer
  the primary text (UX.md §5). (2) Pod Owner links to the owner (ReplicaSet needs a kind descriptor; list + details).
  (3) Deployment Status "N of M pods" links to the deployment's Pods tab (needs that tab; else coordinate with T-0122).
- Out: metrics columns.

## Context pack
- OCP: `/home/bad/works/openshift-console/frontend/packages/console-shared/src/components/datetime/Timestamp.tsx`
  (L22-34), `packages/console-shared/src/utils/datetime.ts:timestampFor` (L140-160); `public/components/utils/owner-references.tsx`,
  `public/components/pod-list.tsx` L388; `public/components/workload-table.tsx` L97-102.
- Ours: `web/src/features/resources/registry/columns.tsx:ageColumn` (`RelativeTime`), `kinds/pods.tsx` owner column,
  `components/ObjectReferenceLink.tsx`, `kinds/deployments.tsx:deploymentStatus`.

## Acceptance criteria
- [ ] Side by side with OCP pods/configmaps lists: Created cells identical format, light + dark.
- [ ] Pod Owner is a kind-badge link; deployment status links to its pods.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
