---
id: T-0131
title: Fit the ReplicaSets and Services lists at 1280
status: done
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0126]
paths: [web/src/features/resources/registry]
review_rounds: 1
---

## Goal
At 1280 the ReplicaSets (982/894 px, Labels column) and Services (906/894 px) tables are wider than the page, so the
last columns scroll behind the sticky kebab. This predates T-0126. Pods, Deployments and the admin lists fit.

## Scope
- Per-column starting widths / `modifier: 'wrap'|'truncate'` via `DataViewColumn` (as T-0126 did for Pods), matching
  how OCP's ReplicaSets and Services lists lay out at 1280. No shared `ConsoleDataView` changes unless the architect agrees.

## Acceptance criteria
- [x] ReplicaSets and Services fit at 1280 and 1920 (light), width stable from loading to loaded to a no-match filter.
- [x] Side-by-side with the reference console at 1280.

## Work log
- 2026-11-22 frontend-engineer: RS Labels `width: 228` (OCP `getLabelsColumnWidthStyleProp`, 228 px rendered there),
  RS Owner and Services Type hidden in all projects below 2xl (Pods precedent). Measured (dev:mock, light, table/area
  px, same loading→loaded→no-match): RS and Services, project and all projects: 894/894 at 1280, 1534/1534 at 1920
  (before: RS all-projects 983/894, Services 906/894). OCP ref: Services 894/894; RS 1039/894 at 1280 (OCP overflows).

## Review
### Code (frontend-architect)
APPROVE. This is consistent with T-0126/Pods: it uses the same `allNamespacesVisibility: ['hidden', 'visibleOn2Xl']`
and per-column `width` through `ColumnDef`, with no shared `ConsoleDataView` change. The comments explain why.
- Nit (optional): `registry/columns.tsx:labelsColumn` could own the 228 px start width. That would match OCP's shared
  `getLabelsColumnWidthStyleProp` and also cover Deployments. Track it as a follow-up if Deployments ever overflows.

### Visual (ux-designer)
APPROVE. Light, dev:mock: RS and Services, project and all projects, measured 894/894 at 1280 and 1534/1534 at 1920.
- RS all projects at 1280 shows Name/Namespace/Status/Labels + kebab, the same columns as the ref
  (`/k8s/all-namespaces/replicasets`, Owner off-screen there). OK.
- Hiding Services Type is right: OCP's Services list (release-4.18 `public/components/service.jsx`; main moved it to the
  networking plugin, so the ref shows the default list) has no Type column. Its columns are Name/Namespace/Labels/
  Pod selector/Location, with Labels ≥ lg and Pod selector/Location ≥ xl.
- Follow-up (not blocking, parity gap): realign the Services columns to OCP's (Labels, Pod selector, Location combining
  cluster IP:port). That is a column redesign, outside this overflow task. Row added to `ocp-parity.md`.
- Follow-up (pre-existing, minor): OCP lets labels wrap inside the Labels cell; ours stay on one line. Logged in parity.

## Handover notes
- Services all-projects overflowed on headers alone (nowrap headers, 897 px with no rows), so no width could fix it;
  Type (not a column in OCP's Services list) is hidden in all projects below 2xl. Shown at ≥ 2xl and per project.
- RS Labels gets a fixed start width: labels don't wrap, so a page-measured width let the longest label overflow.
- OCP's ref Services list here shows only Name/Created (plugin list), so its columns aren't comparable; RS compared.
- `DataViewColumn` has no `modifier` field; not needed, no shared changes.
