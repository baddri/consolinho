---
id: T-0343
title: CP5c UX review — Fleet overview page, Fleet nav for non-admins, UX.md §2 update
status: todo
owner: ux-designer
checkpoint: 5c
depends_on: [T-0340, T-0342]
paths: [docs/architecture/UX.md, docs/architecture/ocp-parity.md, docs/tasks/]
review_rounds: 0
---

## Goal
QG5C-3: style check of the fleet invention against UX.md §5 list rules and OCP list pages, incl. dark theme and the
neutral masthead in the fleet perspective; update UX.md §2 (Fleet management entry now for everyone, Fleet > Overview).

## Scope
- In: `/fleet/overview` light + dark, pending/progressive state, Restricted tooltip, summary line, empty states,
  sidebar for admin vs non-admin, switcher menu. Probe first (`scripts/ui-probe.mjs`), screenshots clipped.
- Out: code fixes (bug tasks to frontend-engineer).

## Context pack
- Docs: UX.md §2, §5; spec §5c.1, §5c.5.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/factory/list-page.tsx`, `NodesPage.tsx` status cells.

## Acceptance criteria
- [ ] Parity row for the Fleet overview (fleet invention, style `match` or bug task).
- [ ] Masthead stays neutral on fleet pages after visiting `prod-k8s-1` (K8s navy must not leak).
- [ ] UX.md §2 updated.

## Work log

## Review

## Handover notes
