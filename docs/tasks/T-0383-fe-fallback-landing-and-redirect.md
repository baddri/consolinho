---
id: T-0383
title: Fallback landing and namespaced redirect — land in the last/first fallback namespace, "No namespaces available" state (NSF-3/4)
status: done
owner: frontend-engineer
checkpoint: 5.5
depends_on: [T-0382]
paths: [web/src/features/resources/ClusterLanding.tsx, web/src/features/resources/ClusterLanding.test.tsx, web/src/features/resources/NamespaceRedirect.tsx, web/src/features/resources/NamespaceRedirect.test.tsx, web/src/features/resources/search/SearchRedirect.tsx, web/src/features/resources/NoNamespacesPage.tsx]
review_rounds: 0
---

## Goal
When the token can't list namespaces, `/c/:cluster` and the sidebar's `k8s/<plural>` links must not go to a 403
(Namespaces list or all-namespaces): they open a namespace the user can work in (spec NSF-3), or an explanatory empty
state with a way to type a name (NSF-4). Persona Alice "wants to open the console and see her pods".

## Scope
- In: `ClusterLanding`, `NamespaceRedirect`, `SearchRedirect` (same redirect rule, else Search 403s), new empty state.
- Out: selector internals (T-0382); list pages' forbidden state (NSF-5, unchanged).

## Contract / design notes
- All three use `useNamespaceFallback(cluster)` and `useLastNamespace(cluster)` from `@/features/cluster-context`.
  While `isFallback === undefined` render `ResourcePageSkeleton` (redirect components too — no premature redirect).
- **Target namespace in fallback mode** = last namespace for this cluster if set, else `namespaces[0]`; never
  `ALL_NAMESPACES`. Not in fallback mode: today's behaviour, unchanged.
- **ClusterLanding** in fallback mode → `resourcePath(cluster, PodModel, { namespace: target })` — Pods list
  (first Workloads item; design decision, spec names only the namespace). No target → `<NoNamespacesPage cluster />`.
- **NamespaceRedirect**: namespaced plural → `target` instead of all-namespaces; cluster-scoped unchanged; no target
  → `<Navigate replace to={/c/<cluster>}>` (lands on the empty state).
- **SearchRedirect**: same target rule; no target → cluster root.
- **NoNamespacesPage** (`{ cluster: string }`): PF `EmptyState` (OCP empty-state variant as `NoClustersPage`),
  title "No namespaces available", body "Your access to this cluster can't list namespaces and none are configured
  for it. Enter a namespace name, or ask a FleetConsole administrator to add one.", `EmptyStateActions` containing
  `NamespaceSelector` (`namespace={undefined}`; its fallback menu offers the Go-to entry, NSF-2) whose `onSelect`
  navigates to the Pods list of that namespace. No toast, no error alert (NSF-4).

## Context pack
- Docs: `FRONTEND.md` § Routing — the URL is the context.
- Touch points: `web/src/features/resources/ClusterLanding.tsx:ClusterLanding`; `NamespaceRedirect.tsx:NamespaceRedirect`;
  `search/SearchRedirect.tsx`; `paths.ts:resourcePath`, `ALL_NAMESPACES`; `useLastNamespace`
  (`web/src/features/cluster-context/useLastNamespace.ts`); `useNamespaceFallback` (T-0382);
  `components/ResourcePageSkeleton`; route table `web/src/features/resources/routes.tsx:resourceRoutes` (L137-160, no change expected).
- Exemplar: empty state `web/src/features/cluster-context/NoClustersPage.tsx` (layout, copy style).
- Tests: `renderApp('/c/dev-k8s-ns')` (T-0381); last namespace via `localStorage['fleetconsole.lastNamespace']`
  (`{"dev-k8s-ns":"team-b"}`); empty case by clearing `inspectNamespaces` of the `team-a-editor` credential in `mockDb`.
- OCP reference: `/home/bad/works/openshift-console/frontend/public/components/namespace.tsx` (Projects empty-state copy
  style); landing behaviour has no OCP counterpart (fleet-specific), keep OCP empty-state look.

## Acceptance criteria
- [x] NSF-3: `/c/dev-k8s-ns` → `k8s/ns/team-a/pods`; with last namespace `team-b` stored → `k8s/ns/team-b/pods`;
  `k8s/deployments` → `k8s/ns/team-a/deployments`; `search` → `search/ns/team-a`; never `all-namespaces`.
- [x] NSF-3: last stored as all (`#all`) → first fallback namespace.
- [x] NSF-4: no fallback namespaces → empty state with exact copy; typing `team-a` and choosing Go-to opens
  `k8s/ns/team-a/pods`; no error toast rendered.
- [x] OpenShift and listable Kubernetes landings unchanged (existing tests green).
- [x] On `NoNamespacesPage` and after a fallback redirect, the namespace toggle reads `Namespace: Select a namespace` without opening the menu, because the redirect warms the shared access-check cache (T-0382 review).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-26 frontend-engineer: `useFallbackTarget` (last ?? first fallback ns; SSAR only when the target depends on it);
  ClusterLanding → Pods of target / NoNamespacesPage; NamespaceRedirect + SearchRedirect → target or cluster root.
  Tests: ClusterLanding.test (NSF-3/4, toggle wording), NamespaceRedirect.test (NSF-3, no SSAR when remembered).

## Review
- 2026-11-26 frontend-architect, round 1: **APPROVE**
  - Toggle AC is met. `ClusterLanding.test` asserts `Namespace: Select a namespace` on `NoNamespacesPage` without
    opening the menu, and after a redirect it checks the same toggle on all namespaces (the target URL has a
    namespace, so the toggle rightly shows that namespace).
  - Copy with `PRODUCT_NAME` is accepted; it matches `NoClustersPage`.
  - The empty state matches what OCP has: OCP has no page-level "no projects" empty state, only the dropdown's
    "No projects found" (`NamespaceDropdown.tsx:49`). We use the PF `EmptyState` + `CubesIcon` + h1 layout of
    `NoClustersPage`, as the contract specifies.
  - `useFallbackTarget.ts` sits outside `paths` but is local to the resources feature and goes through the
    cluster-context public index only. Accepted.
  - Nit (optional): `NamespaceRedirect.tsx:21` and `SearchRedirect.tsx:19` build the cluster root path inline,
    like `LandingRedirect`. A `clusterRootPath(cluster)` helper in `paths.ts` would make that path one source of
    truth. Follow-up only.
  - Nit (optional): `ClusterLanding` (`always: true`) adds one access-check round trip to every OpenShift and
    listable landing. That is inherent to deciding before navigating, it is cached for 60 s, and the TSDoc
    documents it. Keep it.
  - Checked OK: feature boundaries; data via `shared/k8s` only; no new query keys; loading via `ResourcePageSkeleton`;
    empty state with no alert or toast; no `any` or DOM access; a11y (h1 title, labelled toggle); MSW tests cover
    every AC, including 0 access checks when a namespace is remembered or the kind is cluster-scoped; TSDoc on all
    new and changed components and hooks.

## Handover notes
- New helper `web/src/features/resources/useFallbackTarget.ts` (outside `paths`) shared by the three redirects.
- SSAR is skipped when a real namespace is remembered (same target either way) and for cluster-scoped plurals, so
  OpenShift sidebar links stay instant; ClusterLanding and an un-remembered `k8s/<plural>`/`search` pay one cached SSAR.
- SSAR error fails open (today's behaviour: all-namespaces / Projects list, then the list's 403).
- "Toggle reads Select a namespace after a fallback redirect": the redirect targets a namespace, so the toggle shows
  it; tested instead that navigating to all-namespaces afterwards shows "Select a namespace" unopened (cache warmed).
- Empty-state copy uses `PRODUCT_NAME` (like NoClustersPage), so it renders "Consolinho administrator".
