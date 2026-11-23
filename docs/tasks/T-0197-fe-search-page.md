---
id: T-0197
title: Search page — kinds multi-select, label and name filters, one-shot result sections
status: done
owner: frontend-engineer
checkpoint: 4b
depends_on: [T-0189]
paths: [web/src/features/resources/search, web/src/features/resources/routes.tsx, web/src/features/resources/nav/useClusterNav.ts, web/src/features/resources/components/ProjectBar.tsx, web/src/app/router.tsx, web/src/features/home/SearchPage.tsx, web/src/features/home/index.ts, web/package.json, web/package-lock.json]
review_rounds: 0
---

## Goal
SRCH-1/2/3/5: OCP's Search page under Home, replacing the `features/home/SearchPage` placeholder.

## Contract / design notes
- Routes (FRONTEND.md § Routing): `search` → redirect to `search/ns/<last project>` (`useLastNamespace`, as
  `NamespaceRedirect`) or `search/all-namespaces`; `search/ns/:namespace` and `search/all-namespaces` render
  `search/SearchPage.tsx` (lazy). Remove the placeholder route from `app/router.tsx` and delete
  `features/home/SearchPage.tsx` + its export. Nav: static Home item "Search" between Projects (10) and Events (20)
  in `useClusterNav` (OCP Home: Overview, Projects, Search, API Explorer, Events).
- URL state (SRCH-3, OCP `search.tsx` L113-178): `?kind=<ref>,<ref>&q=<k=v>,<k=v>&name=<substr>`; ref =
  `group~version~Kind`, core group `core` (`search/kindRef.ts` — `toRef(model)`, `fromRef(ref)` via `findModel`,
  unit-tested). Unknown refs (kind not served on the new cluster) are dropped silently on render, kept in the URL.
- `ProjectBar` generalised: new prop `pathFor(namespace | undefined): string` replacing the descriptor-based path;
  existing callers pass `(ns) => resourcePath(...)`. Keep its rendering unchanged.
- Toolbar (PF `Toolbar` with `ToolbarFilter` chips, "Clear all filters"): `ResourceKindSelect` — PF6 typeahead
  multi-select with checkboxes (OCP `resource-dropdown`), options = registered descriptors the cluster serves
  (`resourceDescriptors()` ∩ `useK8sDiscovery(cluster).isServed`), grouped label shows `KindBadge`; Label filter
  (TextInput, Enter adds a `key=value` chip, AND); Name filter (TextInput, debounced 300 ms into `name`). Copy from
  OCP: placeholder "Resources", "Search by label...", "Search by name...".
- Results (SRCH-2): one PF `ExpandableSection` per selected kind (OCP `ResourceList` L56, heading = `labelPlural` with
  `KindBadge`), body = `list/ResourceTable.tsx` with columns Name, Namespace (all-namespaces only), Labels, Created
  from the kind's descriptor columns; empty → "No <labelPlural> found"; no kind → EmptyState "No resources selected" /
  "Select one or more resources from the dropdown." (OCP copy).
- Fetching (SRCH-5, FRONTEND.md § Data fetching): `useSearchResults(cluster, model, ns, labelSelector)` =
  `useQuery({ queryKey: ['k8s', cluster, 'search', modelKey(model), ns ?? '', labelSelector], queryFn: ({ signal }) =>
  limiter(() => k8sListAll(cluster, model, { namespace, labelSelector }, signal)), staleTime: 30_000 })`; one module-level
  `pLimit(6)`; name filter client-side. Add `p-limit` pinned exact (`npm i -E p-limit`). No watches.

## Context pack
- Docs: FRONTEND.md § Routing (search rows), § Data fetching (search bullet).
- Exemplars: `list/ResourceTable.tsx` (compact table), `list/ResourceListPage.tsx` (toolbar + ProjectBar usage),
  `components/ProjectBar.tsx`, `routes.tsx:NamespaceRedirect`, `shared/k8s/queryKeys.ts:k8sQueryKeys`,
  `shared/ui/TypeaheadSelect.tsx` (single-select typeahead to mirror for the multi variant).
- PF: patternfly.org Select "Multiple typeahead with checkboxes" example; Toolbar "With filter chips".
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/search.tsx` (`ResourceList` L56,
  `InnerSearchPage` L87, URL params L113-178); `public/components/search-filter-dropdown.tsx`;
  `public/components/useSearchFilters.ts`.

## Acceptance criteria
- [x] SRCH-1: Home nav shows Search; `/c/dev-1/search` redirects to the last project; kinds, label and name filters render chips; "Clear all filters" resets the URL (tests).
- [x] SRCH-2: selecting Deployment + Pod + Service with `app=web` shows three sections with only matching rows; an empty kind shows "No … found"; nothing selected shows OCP's empty state (tests).
- [x] SRCH-3: reloading `?kind=apps~v1~Deployment&q=app%3Dweb` restores the same state; switching cluster keeps the query (test).
- [x] SRCH-5: each section issues exactly one list request with `labelSelector`, none with `watch=true`; 8 kinds selected → at most 6 requests in flight (test with a held MSW handler).
- [x] `kindRef.ts` unit tests (core group, dotted group, unknown ref).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 frontend-engineer: started; OCP ref search.tsx (Accordion sections, Label/Name filter select + text input).
- 2026-11-23 frontend-engineer: done; search/ (page, redirect, kind select, filter input, sections, hooks, kindRef) + tests.
  Full gate: lint/typecheck/build ok; 19 files timed out under load avg 33, all green rerun alone. ui-probe not run
  (hardwired to :5199, which I was told not to use; OCP ref :9000 down) -> ux review should probe.
- 2026-11-23 frontend-engineer: review round 1 fixes: the Label/Name filter uses shared `FilterTextInput` (`/` hint +
  shortcut; Enter still adds a label via onKeyDown); the Resources options wrap KindBadge in a 54px centred span
  (OCP `co-resource-icon--fixed-width`). Targeted search tests, lint and typecheck green.


## Review
- 2026-11-23 ux-designer R1: CHANGES_REQUESTED (mock :5244, 1280 light; OCP ref :9000 down, source-compared)
  - Search filter input — no `/` focus hint; OCP `TextFilter` renders `kbd.co-kbd__filter-input` (`public/components/factory/text-filter.tsx`, `public/style/_forms.scss` `.co-text-filter`) — use `shared/ui/data-view/FilterTextInput` (already reproduces it; pass `onKeyDown` for Enter-to-add-label).
  - Resources dropdown options — badges sit inline so kind names don't line up (`HPA` vs `D`); OCP wraps `ResourceIcon` in `.co-resource-icon--fixed-width` (`display:flex; justify-content:center; width:54px`, `public/components/_resource.scss:23`; used at `resource-dropdown.tsx:184`) — put `KindBadge` in a 54px centred span in the option (chips keep the inline badge as OCP does).
  - OK: nav order (Home: Projects, Search, Events); title "Search"; toolbar `collapseListedFiltersBreakpoint="xl"`, "Clear all filters"; Resource/Label/Name chip categories; "Resources (N)" typeahead with checkboxes, maxMenuHeight 60vh; Name-default filter select with filter icon, placeholders `my-resource`/`app=frontend`; accordion toggle label + xs subtle `group/version`; "No <Kinds> found"; empty state sm + `pf-v6-u-pt-xl-on-md` "No resources selected" (all per `public/components/search.tsx`, `search-filter-dropdown.tsx`, `resource-dropdown.tsx`).
  - Follow-up (non-blocking, needs a task): sections show 4 generic columns; OCP renders each kind's own list page (`search.tsx` `ResourceList` -> `getResourceListPages`/`DefaultPage`), and OCP's "Recently used" group (`resource-dropdown.tsx:257-275`) is absent.
- 2026-11-23 ux-designer R2: APPROVE (mock :5244, 1280 light)
  - R1#1 fixed: `/` kbd rendered at the input's right edge, `/` focuses the input, Label mode + Enter adds `app=web` chip and `?q=` (OCP `factory/text-filter.tsx`).
  - R1#2 fixed: badges centred in a 54px column; all kind names start at the same x (441px) incl. `HPA` (OCP `_resource.scss:23`). No regressions seen.
- Round 1 (frontend-architect, 2026-11-23): **APPROVE**. Gate (search, nav, components, cluster-context): lint/typecheck ok, 10 files / 120 tests green.
- ACs SRCH-1/2/3/5 + kindRef covered by tests; structure mirrors OCP `search.tsx` L260-370 (nested Label/Name `ToolbarFilter`, Accordion, lazy body only while expanded, copy). Deviations from task text are justified by OCP.
- `p-limit` warranted: FRONTEND.md § Data fetching L141-143 names it, TanStack Query has no cross-query concurrency cap, and a hand-rolled semaphore would go against "libraries over hand-rolled". Lock diff is clean (old dev-transitive 3.1.0 nested under `p-locate`, 7.3.3 + yocto-queue 1.2.2 hoisted).
- Feature boundaries ok: `search/` sits inside `features/resources`; `home` only lost the placeholder.
- Nit (optional): `components/ProjectBar.tsx` keeps a `descriptor | pathFor` union instead of the planned replacement. Accepted; migrating the callers is the follow-up named in the Handover notes.
- Nit (optional): `search/useSearchResults.ts:40` — a query cancelled while queued still takes a limiter slot briefly (the fetch rejects immediately on the aborted signal). Harmless.
- Follow-ups (not blocking): pagination of result tables; kind chip close label "Close [object Object]" (also in OCP; PF `ToolbarLabel` node).

## Handover notes
- **New dep `p-limit` 7.3.3** (pinned), so others need `npm ci`. A module-level `pLimit(6)` caps in-flight search lists.
- Follows the current OCP `search.tsx` where the task text differs: Accordion sections (toggle = plural label + small
  `group/version`), a Label/Name filter Select + TextInput (placeholders `app=frontend` / `my-resource`), kind
  select "Resources (N)", empty state "No resources selected".
- `ProjectBar` props are now a union: `descriptor` (existing callers, unchanged) **or** `pathFor(ns, search)`.
  Follow-up: migrate the callers to `pathFor` and drop the `descriptor` branch.
- `/c/:c/search` redirects (`SearchRedirect`) to the last project or all-namespaces and keeps the query string. The
  old home placeholder `SearchPage` was removed.
- Search nav item = static Home item (order 15) in `useClusterNav` between Projects (10) and Events (20).
- Unknown or unserved `?kind=` refs stay in the URL but render nothing (e.g. after a cluster switch). No pagination.
- PF quirk (same in OCP): the close button of a kind chip (a ReactNode label) is announced as "Close [object Object]".

