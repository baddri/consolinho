---
id: T-0343
title: CP5c UX review — Fleet overview page, Fleet nav for non-admins, UX.md §2 update
status: done
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
- [x] Parity row for the Fleet overview (fleet invention, style `match` or bug task).
- [x] Masthead stays neutral on fleet pages after visiting `prod-k8s-1` (K8s navy must not leak).
- [x] UX.md §2 updated.

## Work log
- 2026-11-25 ux-designer: probed `/fleet/overview` (alice, admin, bob) vs OCP `/k8s/cluster/nodes`: nav section toggle, links and switcher toggle 0 mismatches. Switcher menu has "Fleet management" for everyone (bob: + "No clusters"); Fleet administration admin-only, `/fleet/admin/*` as alice shows the no-access page.
- Masthead/nav header neutral on fleet after `prod-k8s-1` (switcher, Back, Forward; light + dark). Table, alert, spinner, summary, empty state: T-0342 r2, not re-audited.
- UX.md §2 updated (Fleet › Overview for everyone, entry for every user, neutral masthead); parity rows: nav sections, switcher, new `/fleet/overview` row. Bug T-0361 (mock catch-all breaks the lazy Fleet overview).

## Review
- 2026-11-25 ux-designer: **APPROVE** the fleet invention (style `match`, OCP `NavHeader.tsx` perspective items, `console-extensions.json` Home › Overview `dashboards`, `list-page.tsx`).
- 1. Mock-only: `/fleet` redirect and switcher › "Fleet management" from a cluster page show "Failed to fetch dynamically imported module" (MSW `*/api/*` matches `src/features/fleet/api/*.ts`) → T-0361.

## Handover notes
