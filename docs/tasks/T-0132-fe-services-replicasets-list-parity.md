---
id: T-0132
title: Services list columns and ReplicaSet label wrapping as OCP (parity-matrix gap rows)
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: []
paths: [web/src/features/resources, web/src/shared/ui/data-view, docs/architecture/ocp-parity.md]
review_rounds: 1
---

## Goal
CP3.6 is done only when every `ocp-parity.md` row is `match` or human-waived. Two list rows are still `gap` with no
waiver (CP3.6 verify, 2026-11-22): Services and ReplicaSets. Close them, or get the human to waive them explicitly.

## Scope
- In: Services columns Name/Namespace/Labels/Pod selector/Location (OCP release-4.18 `public/components/service.jsx`),
  Labels >= lg, Pod selector/Location >= xl; Labels cells wrap inside the cell like OCP (ReplicaSets, Services,
  Deployments), still fitting at 1280/1920 (T-0131 criteria).
- Out: other list pages.

## Context pack
- Follow-up notes: `docs/tasks/T-0131-fe-list-overflow-replicasets-services.md` Handover notes (lines 43-46).
- OCP reference: `public/components/service.jsx` (release-4.18), `public/components/replicaset.jsx`.

## Acceptance criteria
- [x] Services list columns and breakpoints equal OCP's; ReplicaSets/Services labels wrap in the cell.
- [x] Both lists fit at 1280 and 1920, width stable from loading to loaded to no-match (T-0131 checks still hold).
- [x] Parity rows for Services and ReplicaSets set to `match` (or the human's waiver recorded in the row).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-22 qa-engineer: filed from CP3.6 verify (`docs/specs/CP3.6-verify.md`).
- 2026-11-22 frontend-engineer: started; OCP refs release-4.18 `service.jsx`, `label-list.tsx`/`_label.scss`.
- 2026-11-22 frontend-engineer: Services columns as OCP; shared Labels cell wraps/truncates (grid `minmax(0,max-content)`),
  start width 180 on `labelsColumn`, "No labels"/"No selector". Measured (dev:mock, light, seeded 7 long labels): RS/Deploy/
  Services, project + all projects: 894/894 at 1280, 1534/1534 at 1920, stable loading→loaded→no-match. check-fe green.

## Review

### Visual (ux-designer)
APPROVE (2026-11-22; dev:mock admin, light+dark, 1280/1920; ref `127.0.0.1:9000` RS/Deploy all projects; release-4.18 `service.jsx`).
- Services columns/breakpoints = OCP `tableColumnClasses` (Labels lg, Pod selector/Location xl); Location per type, "No labels"/"No selector" subtle as OCP `LabelList`/`Selector`.
- Re-measured with 7 seeded long labels: table 894/894 (1280) and 1534/1534 (1920) on Services/RS/Deploy, project and all projects; labels wrap, long ones end in "…".
- Deviation accepted: all-projects Services hides Location below 2xl (OCP itself overflows at 1280: ref RS clips its Labels column; fleet rule is no horizontal scroll, same as Pods' Owner).
- 180px accepted: it is only the start width; Labels gets spare room (182-296 at 1280, 473-627 at 1920), Deploy all projects is the binding case.
- Follow-up (pre-existing, all lists, not this task): OCP list labels are blue links to Search (`public/components/utils/label-list.tsx`, `PfLabel href=/search?kind=&q=`); ours are plain grey. Parity row added.

### Code (frontend-architect)
APPROVE (2026-11-22; check-fe green, 811 tests). `serviceLocations` matches release-4.18 `ServiceLocation` line by line
(NodePort/LoadBalancer incl. Pending and `hostname||ip||'-'`/ExternalName/default + headless "None"), unit-tested per
type; columns, breakpoints and `spec.clusterIP` sort as OCP; selector link reuses ADR-0023 `?label=` Pods filter;
wrapping in a feature CSS module with the `_label.scss` reference; no `shared/ui/data-view` change.
Nits (optional): `services.tsx` ServiceLocation — `pf-v6-u-text-truncate` won't truncate a long LB hostname in an
auto-layout table (it widens the column instead); give it the same `minmax(0,max-content)` wrapper if that ever shows up.

## Handover notes
- Labels cells: `registry/columns.module.css` wraps `LabelList` in a one-track grid `minmax(0, max-content)`: min-content
  0 (long labels truncate, table never overflows) but natural max-content (column still gets spare room). Plus OCP's
  `min-width: 0` on the label-group items. Before: a 7-long-label RS made tables 1156-1352/894 at 1280.
- Start width now on shared `labelsColumn` (RS override removed): 180, not OCP's 200/228 — Deployments all projects
  at 1280 has 710 px of nowrap headers + Name, so 228 overflowed (938/894).
- Services: Labels ≥ lg, Pod selector/Location ≥ xl as OCP; deviation: Location also hidden below 2xl in all projects
  (headers alone are 934 px at 1280). `serviceLocations` mirrors OCP `ServiceLocation` (unit-tested per type).
- `PodSelectorLink` empty shows "No selector" (OCP `Selector`), was "—"; affects Deployments/details too.
- Labels column not sortable (OCP sorts by `metadata.labels`); left as all our lists. Measure script: t132.mjs (scratch).
