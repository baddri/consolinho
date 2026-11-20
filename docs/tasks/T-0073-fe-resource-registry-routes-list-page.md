---
id: T-0073
title: Resource registry, /k8s routes, registry-driven nav and the generic live list page (Pods, ConfigMaps, Events)
status: done
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0071, T-0072]
paths: [web/src/features/resources/, web/src/app/router.tsx, web/src/app/router.test.tsx, web/src/app/layout/AppSidebar.tsx, web/src/app/layout/navigation.ts, web/src/app/layout/AppShell.test.tsx, web/vite.config.ts]
review_rounds: 0
---

## Goal
Implement ADR-0023 §1–3, §5: the registry, the OCP-shaped routes, the sidebar built from registry + discovery, and
one generic list page that renders any descriptor live (UI-1..3, DATA-1/2/4, UI-10), proven with Pods, ConfigMaps and
Events. Other kinds follow in T-0078; details in T-0075.

## Scope
- In: `registry/{types.ts,registry.ts,columns.tsx}`, `registry/kinds/{pods,configmaps,events}.tsx`, `paths.ts`,
  `routes.tsx` (lazy pages) + `ClusterLanding`, simple `NamespaceRedirect` (→ `all-namespaces` / `cluster`; T-0074
  adds the remembered project), `list/{ResourceListPage,ResourceTable,ResourceListToolbar,LiveIndicator}.tsx`,
  `components/{ResourceLink,KindBadge,ResourceStatusLabel,ResourceErrorState}.tsx`, `nav/useClusterNav.ts`, router
  and sidebar wiring. Remove the old placeholder routes/pages.
- Out: namespace selector (T-0074 — leave a clearly marked slot in the list header), row kebab/actions (T-0076),
  details page (T-0075, keep the details routes pointing at the existing placeholder until then).

## Contract / design notes
- Routes, URL params (`?name=`, `?label=`, `?status=`, `?type=`), descriptor shape: ADR-0023 §1–3 verbatim.
  `resourcePath(cluster, model, { namespace?: string | 'all'; name?: string; tab?: 'yaml' | 'events'; search?: string })`.
- `ClusterLanding` (index of `c/:cluster`): `useK8sDiscovery` → `<Navigate replace>` to Projects if
  `ProjectModel` served, else Namespaces; while pending a page skeleton. Replaces `<Navigate to="overview">`.
- `useClusterNav(cluster): NavSection[]` (structurally the `NavSection` of `app/layout/navigation.ts`; export the type
  from resources and import it in `navigation.ts`): sections Home (Projects, Events), Workloads (Pods, Deployments,
  ConfigMaps), Networking (Services), Administration (Namespaces) from `descriptor.nav`, hiding kinds not served;
  items link to `k8s/<plural>` (`NamespaceRedirect`) and are active for any `k8s/(ns/<x>|all-namespaces|cluster)/<plural>`
  path. Descriptors for Deployments/Services/Projects/Namespaces arrive in T-0078 — the nav shows what is registered.
  `buildClusterNav` is deleted; `buildAdminNav` stays.
- List page: `PageSection` header = `KindBadge` + `labelPlural` title + `LiveIndicator` ("Live" / "Paused — retrying"
  compact `Label`, nothing while connecting); toolbar via `shared/table` `FilterToolbar` (name `SearchInput`, label
  selector text input applied on Enter → `?label=`, descriptor checkbox filters with chips, "Clear all filters");
  compact composable PF `Table` with sortable `Th` (`useClientSort`), Namespace column only for `all-namespaces`
  (`allNamespacesOnly`), PF `Pagination` (default 50/page, options 20/50/100) over filtered+sorted rows; name filter
  through `useDeferredValue`. Data: `useK8sList(cluster, model, { namespace, labelSelector })`.
- States (UI-10): pending → `TableSkeletonRows`; `Kubernetes.Forbidden` → EmptyState "Restricted access" with "The
  service account for `<cluster>` can't list `<plural>` in `<ns>`" (or "in any project" for all-namespaces); other
  errors → `ErrorState` (shows `detail`, Retry = `refetch`); empty → "No `<plural>` found in `<ns>`" or, with filters
  active, "No `<plural>` match the filters" + Clear filters. Unknown plural → "Kind not supported yet"; registered but
  not served → "`<Kinds>` aren't available on `<cluster>`".
- Shared column helpers: `nameColumn()` (link to details via `resourcePath`), `namespaceColumn()` (link to the
  namespaced list), `ageColumn()` (`RelativeTime`, absolute tooltip; sort by timestamp), `labelsColumn()` (`LabelList`).
- Pods (UI-3): Name, Namespace, Status (`podStatus(pod)`: deletionTimestamp → Terminating; first container waiting or
  terminated reason, e.g. `CrashLoopBackOff`; else `status.phase`), Ready (`ready/total`), Restarts (sum), Owner (first
  ownerReference; `ResourceLink` if `descriptorForKind` finds it, else `Kind name` text), Created; status filter
  Running/Pending/Failed/Succeeded/CrashLoopBackOff/Unknown. `ResourceStatusLabel` colours (spec §5): red
  Failed/CrashLoopBackOff/Error/ImagePullBackOff/ErrImagePull, orange Pending/ContainerCreating, green
  Running/Succeeded, grey otherwise.
- ConfigMaps: Name, Namespace, Keys (count of `data` + `binaryData`), Created.
- Events: Type (Warning → orange/danger label), Reason, Involved object (link if registered), Message, Count, Last
  seen (`lastTimestamp ?? eventTime ?? creationTimestamp`); type filter Normal/Warning; default sort Last seen desc;
  `hasEventsTab: false`. Export an `eventColumns({ withInvolvedObject })` helper — T-0075's Events tab reuses it.
- Code splitting: list page lazy; add nothing to the vendor groups unless the build warns.

## Context pack
- Docs: ADR-0023 (all), ADR-0022 §7/§10, FRONTEND.md § "Routing", § "The resource registry", § "Admin list pages",
  spec §4.8 UI-1..3, UI-10, §5 UX notes.
- Exemplars: `web/src/features/admin/routes.tsx:L24-L80` (lazy `RouteObject`s + `handle`),
  `web/src/features/admin/clusters/ClustersListPage.tsx:ClustersListPage` (toolbar + Table + states composition),
  `web/src/features/admin/clusters/clusterFilters.ts` (`useUrlFilters` defs), `web/src/app/layout/navigation.ts:L19-L48`
  (matchers to rewrite), `web/src/shared/table/TableStateRows.tsx:TableSkeletonRows|TableEmptyRow`.
- Touch points: `web/src/app/router.tsx:L29-L41` (`c/:cluster` children), `web/src/app/layout/AppSidebar.tsx:L36-L41`
  (`buildClusterNav` → `useClusterNav`), `web/src/features/resources/index.ts`, `web/src/shared/ui/index.ts`
  (`ErrorState`, `RelativeTime`, `LabelList`), `web/src/shared/k8s` hooks (T-0071), `web/src/app/router.test.tsx`
  + `web/src/features/cluster-context/clusterContext.test.tsx:L227-L270` (sidebar link tests — update paths),
  `web/src/test/coldStart.ts:preloadLazyRoutes`. PF `Table` rows are in `role="grid"`.

## Acceptance criteria
- [x] UI-1/UI-2: `/c/dev-1` lands on Projects (Namespaces on `lab-1`); nav shows exactly the registered + served kinds
      in the spec's sections, active item highlighted; "Fleet administration" still last for admins (SW-11).
- [x] QG-3 per kind (Pods, ConfigMaps, Events): render with fixtures; loading skeleton; empty; 403 restricted; 502
      `Proxy.CredentialRejected` shows its detail with Retry and does **not** log out (ines on prod-us-1).
- [x] UI-3: name filter, label filter (`app=web,tier!=db` sent as `labelSelector`), pod status filter, Event type
      filter, sorting, Namespace column only in all-namespaces, filters survive reload (URL).
- [x] Live: `mockK8s.upsert` of a new pod appears and a removed pod disappears without reload; "Paused — retrying" while
      the watch fails.
- [x] DATA-4: 2,000 seeded pods render one page of 50 rows, the name filter narrows them, and a watch update to a
      visible pod shows — within the cold-start timeouts, no global timeout raised.
- [x] Unknown plural and not-served kind empty states; registry plural uniqueness unit test.
- [x] Build (no chunk-size warning), lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: started; registry, routes, nav, generic list page.
- 2026-11-20 frontend-engineer: done. `features/resources/{paths,routes,resourceRoute,ClusterLanding,NamespaceRedirect}`,
  `registry/` (pods, configmaps, events), `list/`, `components/`, `nav/useClusterNav`; sidebar/router wired, old
  placeholders gone. Outside `paths`: `LandingRedirect` → `/c/<name>` (so `/` reaches Projects) + its/session tests.
  check-fe green (55 files / 618 tests, build without chunk warning).

## Review
**APPROVE** (frontend-architect, round 1). check-fe green (55 files / 618 tests, build ok). Conforms to ADR-0023 §1–3/§5
(routes, scope-mismatch redirect, descriptor shape, nav from registry + discovery) and ADR-0022 (error checked before
data, `useK8sList` only, one watch per list, no per-row hooks beyond `useActiveCluster`). No feature cycle
(cluster-context doesn't import resources), no `any`/DOM access. Deviations accepted: lazy `resourceDescriptors()`
(import cycle, documented), cluster-scoped nav links straight to `k8s/cluster/<plural>`, `nameColumn(model)`/
`namespaceColumn(model)`, no Name column on Events (not in the task's column list), discovery failure → Namespaces;
`/c/<x>` showing "Kind not supported yet" is acceptable only until T-0078 lands — T-0078 must not slip out of CP2.
Nits (optional):
- list/ResourceListPage.tsx:135-138 — page isn't reset when name/label/status filters change (clamped only), so filtering on page 3 shows page 3 of the result — reset to 1 on filter change (e.g. page state tagged with a filter signature), here or in T-0078.
- app/layout/AppSidebar.tsx:22 — `aria-current` is redundant: PF `NavItem` sets it on the cloned child from `isActive`.
- list/ResourceListPage.test.tsx — no test for the scope-mismatch redirect (`k8s/cluster/pods` → `all-namespaces`); add one with T-0078's cluster-scoped kinds.

## Handover notes
- Paths only via `resourcePath(cluster, model, { namespace?, name?, tab?, search? })`; `ALL_NAMESPACES = 'all'`.
  Cluster-scoped kinds always build `k8s/cluster/<plural>` (nav links there directly, not via `k8s/<plural>`).
- Route `handle: { scope: 'ns'|'all'|'cluster', tab? }`; `useResourceRoute()` (resourceRoute.ts) decodes params +
  handle. T-0075: replace `ResourceDetailsPage` (lazy in routes.tsx, tabs already routed); scope-mismatch redirect
  exists only on list routes. Reuse `ResourceErrorState` (`verb="get"`; add the 404 case), `ResourceLink`,
  `ObjectReferenceLink`, `KindBadge`, `ResourceStatusLabel`, `eventColumns({ withInvolvedObject: false })`.
- T-0074: `NamespaceRedirect` (→ all-namespaces now) and the marked slot comment in `ResourceList`'s header.
- T-0078: one `registry/kinds/<plural>.tsx` + a line in `registry.ts:resourceDescriptors()` (lazy array — kind modules
  import the registry via `ObjectReferenceLink`, a cycle). Use `nameColumn(model)`/`namespaceColumn(model)` (take the
  model), `ageColumn()`, `labelsColumn()`, `statusColor()`. Projects → `/c/x` landing stops showing "not supported".
- Descriptor callbacks are methods (bivariance), incl. `DetailsSection?(props)`; lint `unbound-method` → call them
  through arrows. `useK8sDiscovery().isServed` likewise: don't destructure it.
- Landing falls back to Namespaces when discovery fails (baseline set).
