---
id: T-0197
title: Search page — kinds multi-select, label and name filters, one-shot result sections
status: todo
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
- [ ] SRCH-1: Home nav shows Search; `/c/dev-1/search` redirects to the last project; kinds, label and name filters render chips; "Clear all filters" resets the URL (tests).
- [ ] SRCH-2: selecting Deployment + Pod + Service with `app=web` shows three sections with only matching rows; an empty kind shows "No … found"; nothing selected shows OCP's empty state (tests).
- [ ] SRCH-3: reloading `?kind=apps~v1~Deployment&q=app%3Dweb` restores the same state; switching cluster keeps the query (test).
- [ ] SRCH-5: each section issues exactly one list request with `labelSelector`, none with `watch=true`; 8 kinds selected → at most 6 requests in flight (test with a held MSW handler).
- [ ] `kindRef.ts` unit tests (core group, dotted group, unknown ref).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
