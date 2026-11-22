---
id: T-0121
title: OCP parity — resource list pages (DataView toolbar, columns, pagination, kind badges, status icons)
status: todo
owner: frontend-engineer
checkpoint: 3.6
depends_on: [T-0119]
paths: [web/src/features/resources/list, web/src/features/resources/components, web/src/features/resources/registry, web/src/shared/ui, web/package.json]
review_rounds: 0
---

## Goal
Make Pods, Deployments, ConfigMaps, Services and Projects lists look and behave like OCP's `ConsoleDataView` lists,
and introduce the shared kind badge and status mapping every other page reuses. Absorbs T-0095 and T-0118 items 3–4.

## OCP reference
- Routes: `/k8s/ns/openshift-console/pods`, `/k8s/ns/openshift-console/deployments`, `/k8s/cluster/projects`.
- Source: `packages/console-app/src/components/data-view/ConsoleDataView.tsx` (toolbar L405-545, `BodyEmpty` L59,
  `BodyLoading` L55), `DataViewTextFilter.tsx`, `DataViewLabelFilter.tsx`, `useConsoleDataViewColumns.ts` (sticky props
  L28-75), `useConsoleDataViewResizableColumns.ts`, `ConsoleDataViewColumnManagementModal.tsx`, `ConsoleDataView.scss`;
  `public/components/pod-list.tsx`, `namespace.tsx`; `public/components/_resource.scss` + `public/style/_vars.scss`
  (kind badges); `packages/console-dynamic-plugin-sdk/src/app/components/status/Status.tsx` (status → icon).

## Differences to fix
1. Toolbar — our separate "Filter by name", Status select, label-selector input + "→" button — OCP `DataViewToolbar` +
   `DataViewFilters`: category select (filter icon + "Name"/"Label"/attribute; hidden when only one filter), one text
   input "Filter by name" with the `/` keyboard hint, label filter with typeahead of existing labels, chips +
   "Clear all filters" — rebuild with `@patternfly/react-data-view` (OCP uses ~6.5; frontend-architect confirms the
   dependency and notes it in FRONTEND.md) or our own composition with the same DOM.
2. Toolbar actions — missing — plain icon buttons "Manage columns" (opens column management modal, choice persisted
   per kind) and "Reset column widths" (only when widths changed).
3. Table — fixed columns, headers truncated at 1440 [T-0095], generated names wrap badly [T-0118 #3] — OCP
   `DataViewTable variant="compact" isResizable`; Name column sticky, `nowrap`, right border; kebab column sticky with
   left border; Namespace `nowrap`; no fixed widths on Ready/Restarts.
4. Pagination — bottom full pagination with page input; shown with 3 rows [T-0118 #4] — OCP compact `Pagination` in the
   toolbar (top) and compact bottom (`PaginationVariant.bottom isCompact`) — mirror; per-page default 50.
5. Kind badges — pale PF label — OCP `co-m-resource-icon`: filled pill, white text, `border-radius: 20px`,
   `padding: 1px 4px`, `min-width: 18px`, `line-height: 16px`, `margin-right: 4px`; colours by kind (`_vars.scss`:
   Pod `#009596`, Deployment/ReplicaSet/StatefulSet/DaemonSet/Job `#004080`, Namespace/Project `#1e4f18`, ConfigMap
   `#40199a`, Secret `#c46100`, Service `#6ca100`, default `#2b9af3`); `--lg` variant for headings (font +3px,
   `line-height: 20px`, `min-width: 24px`, `padding: 0 7px`, `margin-right: 7px`). CSS module, each rule commented
   with the OCP scss path (OCP hard-codes these hex values; same in both themes).
6. Status cells — Running = green check, Pending = hourglass — map exactly like OCP `Status.tsx` (UX.md §5): Running
   → sync icon (uncoloured), Pending → in-progress icon, CrashLoopBackOff/Error → red exclamation, Active/Ready/
   Succeeded/Completed → green check, Terminating → ban icon, Unknown → unknown icon. Use the `rh-ui-*` icons from
   `@patternfly/react-icons` that OCP uses. One shared component for lists, details and admin.
7. Heading — no "Create <Kind>" — primary "Create Pod"/"Create Deployment"/… in the heading action slot when the user
   can create (opens the existing YAML create flow or is hidden if none exists; no new create feature here).
8. Empty — check — table body row with centred "No <plural> found" (`BodyEmpty`); loading = `SkeletonTableBody`
   5 rows.
9. Projects list — "—" placeholders — OCP copy "No display name", "No requester" (`namespace.tsx`).
10. Metrics columns (Memory, CPU) — OCP shows them — out of scope (no metrics source); note in parity matrix.

## Context pack
- Docs: `UX.md` §3, §5; `FRONTEND.md` § model descriptors.
- Touch points: `web/src/features/resources/list/ResourceListPage.tsx`, `ResourceListToolbar.tsx`, `ResourceTable.tsx`,
  `useResourceFilters.ts`; `components/KindBadge.tsx`, `ResourceLink.tsx`, `ResourceStatusLabel.tsx`;
  `web/src/shared/ui/StatusIconText.tsx`; kind descriptors in `features/resources/registry`.
- PF: `DataView*` (react-data-view), `Table` sticky/resizable props, `Pagination isCompact`, `Modal` (column management).

## Acceptance criteria
- [ ] Side-by-side `/c/dev-1/k8s/ns/shop/pods` vs OCP `/k8s/ns/openshift-console/pods` matches at 1280 in light and
      dark (toolbar, badges, status icons, sticky columns, pagination); same for deployments and projects.
- [ ] At 1280 and 1440 every header is fully readable or resizable (T-0095 criterion).
- [ ] Column management choice survives reload.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
