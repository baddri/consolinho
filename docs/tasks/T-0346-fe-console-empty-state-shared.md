---
id: T-0346
title: Shared ConsoleEmptyState (OCP sm, centred) for "No conditions found" and the inline copies
status: done
owner: frontend-engineer
checkpoint: 5a
depends_on: [T-0307]
paths: [web/src/shared/ui/, web/src/features/resources/components/, web/src/features/resources/networking/, web/src/features/resources/workloads/config/, web/src/features/resources/events/, web/src/features/resources/yaml/]
review_rounds: 0
---

## Goal
`ConditionsTable` renders "No conditions found" as bare 14px text; OCP renders it with `ConsoleEmptyState` (PF
`EmptyState variant="sm"`, `pf-v6-u-pt-xl-on-md`, centred, 16px subtle body). Add one shared component and use it,
replacing the six hand-written copies of the same markup. Found by T-0307 review, confirmed by T-0310.

## Scope
- In: new `web/src/shared/ui/ConsoleEmptyState.tsx`; `ConditionsTable` empty branch; migrate the inline copies.
- Out: list empty rows (`ConsoleDataView` BodyEmpty), `LoadError`, admin empty states.

## Contract / design notes
- `ConsoleEmptyState({ title?, children?, variant = 'sm' })` → `<EmptyState variant className="pf-v6-u-pt-xl-on-md"
  titleText={title} headingLevel={headingLevel}>` + `EmptyStateBody` when children (OCP
  `packages/console-shared/src/components/empty-state/ConsoleEmptyState.tsx` L11-49; OCP passes no headingLevel, so
  callers with a title pass one that fits the page outline, e.g. `h2`/`h3`).
- `features/resources/components/ConditionsTable.tsx:18`: `return <ConsoleEmptyState>No conditions found</ConsoleEmptyState>;`
  (OCP `public/components/conditions.tsx` L93).
- Migrate (same output, one component): `networking/routes/RouteDetails.tsx` `NoRouteStatus` (~L203),
  `networking/ingresses/IngressDetails.tsx` (~L106), `workloads/config/DataSection.tsx` (~L49),
  `events/EventStreamView.tsx` (~L17), `yaml/ExploreTypeSidebar.tsx` (~L99).

## Context pack
- Probe: PVC details without conditions (mock) vs `/k8s/ns/consolinho/persistentvolumeclaims/data-postgres-0` on
  the reference console — body 16px, subtle colour, centred, top padding `--pf-t--global--spacer--xl` at ≥ md.

## Acceptance criteria
- [x] "No conditions found" matches OCP in the probe (font-size, color, text-align, padding-top).
- [x] The five inline copies use the component; their rendering is unchanged (tests still pass).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-25 frontend-engineer: `shared/ui/ConsoleEmptyState` (sm, `pf-v6-u-pt-xl-on-md`, optional title/headingLevel); ConditionsTable + Route/Ingress/DataSection/EventStream/ExploreType migrated.
- Probe PVC db-data vs OCP data-postgres-0, `.pf-v6-c-empty-state` + `__body` font-size/color/text-align/padding-top: 0 mismatches / 12.

## Review
- 2026-11-25 ux-designer: **APPROVE**. Probe `.pf-v6-c-empty-state` + `__body` (display, font-size, color, text-align, padding-top/bottom, margin-top) vs OCP PVC `data-postgres-0` (`ConsoleEmptyState`, `conditions.tsx` L93):
- PVC db-data "No conditions found": 0 mismatches / 22.
- Route `pending` "No route status": only the body text width differs (111 vs 145, different copy) = plugin `NoRouteStatus` EmptyBox.
- PVC Events tab "No events" vs OCP PVC events (`events.tsx` L291): 0 mismatches / 18; no title, as OCP.
- 2026-11-25 frontend-architect, round 1: **APPROVE**. `shared/ui/ConsoleEmptyState.tsx` mirrors OCP `ConsoleEmptyState.tsx` (sm default, `pf-v6-u-pt-xl-on-md`, body only with children); ConditionsTable = OCP `conditions.tsx:93`; five copies migrated with identical markup. check-fe green.
- Nit (optional, follow-up): `features/resources/search/SearchPage.tsx:154` is a sixth inline copy (outside this task's paths) — migrate with `title`/`headingLevel="h2"` in a later task.

## Handover notes
- `ConsoleEmptyState` exported from `@/shared/ui`; EventStreamView keeps `headingLevel="h2"` as before. Body only renders when children are given.
