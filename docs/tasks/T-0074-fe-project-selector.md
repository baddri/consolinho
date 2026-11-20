---
id: T-0074
title: Project/namespace selector with remembered project, default-project toggle and typed fallback
status: todo
owner: frontend-engineer
checkpoint: 2
depends_on: [T-0073]
paths: [web/src/features/cluster-context/, web/src/features/resources/list/ResourceListPage.tsx, web/src/features/resources/NamespaceRedirect.tsx, web/src/features/resources/routes.tsx]
review_rounds: 0
---

## Goal
Namespaced list pages get an OCP-style project selector (NS-1..4, US-4): "All projects" + searchable list sourced
from projects (or namespaces on vanilla Kubernetes), URL-driven, remembered per cluster, with default projects
hidden by default and a typed fallback when the SA can't list projects.

## Scope
- Carried T-0072 review nits (optional, cheap): `useRecentClusters.ts:remember` drops revoked clusters on write so 5 slots
  stay useful; "No clusters match" in `ClusterSwitcher.tsx` announced via a polite live region.
- In: `NamespaceSelector`, `useLastNamespace`, `useShowDefaultProjects` in `features/cluster-context` (exported from
  its `index.ts`); render it in the list page header slot left by T-0073; `NamespaceRedirect` uses the remembered
  project.
- Out: selector on details pages (OCP shows it read-only there — not in CP2), project creation.

## Contract / design notes
- No BE change (contract §6: client-side). Data: `useK8sList(cluster, isServed(ProjectModel) ? ProjectModel :
  NamespaceModel, {})` + `useK8sDiscovery` (T-0071) — the list is what the SA can see (NS-1), live.
- `NamespaceSelector({ cluster: string; namespace: string | undefined /* undefined = all */; onSelect(namespace: string | undefined): void })`
  — controlled; it never builds resource URLs. PF `MenuContainer` + `MenuToggle` ("Project: shop" / "Project: All
  projects"; "Namespace:" when projects aren't served) + `Menu` with `MenuSearch`/`SearchInput`, "All projects" item,
  filtered `MenuList`, `MenuFooter` with a PF `Switch` "Show default projects". Same building blocks as T-0072's
  switcher — reuse its structure, don't share a component unless it falls out naturally.
- NS-4: default = name `default`, `openshift`, or prefix `openshift-` / `kube-`; hidden unless the toggle is on
  (`localStorage['fleetconsole.showDefaultProjects']`, per browser). The currently selected project is always shown.
- NS-3: list error `Kubernetes.Forbidden` → menu shows an inline info text "You can't list projects on `<cluster>`;
  enter a project name." and Enter in the search box selects the typed name (DNS-label check: reuse
  `shared/forms/dnsLabel.ts` if it fits). Other list errors → same typed fallback with the error `detail`.
- NS-2: `useLastNamespace(cluster): [string | undefined /* undefined = all */, (ns: string | undefined) => void]` on
  `useStoredValue` (T-0072), key `fleetconsole.lastNamespace` (JSON map cluster → name or `"#all"`). The list page
  writes it whenever a namespaced list renders; `NamespaceRedirect` reads it (`k8s/<plural>` → `k8s/ns/<last>/<plural>`
  or `k8s/all-namespaces/<plural>`). Selecting navigates via `resourcePath(...)` keeping `location.search`.

## Context pack
- Docs: spec §4.6 NS-1..4, §5 "Components"; ADR-0023 §6.
- Exemplars: T-0072's `ClusterSwitcher` (Menu + search pattern), `web/src/features/cluster-context/useLastCluster.ts`
  (as refactored onto `useStoredValue` by T-0072), `web/src/shared/forms/dnsLabel.ts`.
- Touch points: `web/src/features/resources/list/ResourceListPage.tsx` (header slot from T-0073),
  `web/src/features/resources/NamespaceRedirect.tsx` (T-0073's simple version), `web/src/features/resources/paths.ts:resourcePath`,
  `web/src/features/cluster-context/index.ts`, `web/src/shared/k8s` (`useK8sList`, `useK8sDiscovery`, `ProjectModel`,
  `NamespaceModel`), mocks: `mockK8s` + `server.use` to force a 403 on the projects list (QG-3 "project selector fallback").

## Acceptance criteria
- [ ] NS-1: selector on namespaced lists only; "All projects" + projects of `dev-1`; namespaces on `lab-1`; search filters.
- [ ] NS-2: choosing `shop` on all-namespaces Pods → `/c/dev-1/k8s/ns/shop/pods` (search kept); nav "Pods" later
      opens `/k8s/ns/shop/pods`; remembered separately per cluster.
- [ ] NS-3: projects list 403 → message shown, typing `shop` + Enter navigates to `ns/shop`.
- [ ] NS-4: `openshift-monitoring`, `kube-system`, `default` hidden until the toggle is on; toggle remembered.
- [ ] A project created via `mockK8s.upsert` appears in the open menu (live).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
