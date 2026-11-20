---
id: T-0074
title: Project/namespace selector with remembered project, default-project toggle and typed fallback
status: done
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
- Carried T-0073 review nits (optional): reset table to page 1 when filters/namespace change (`list/ResourceListPage.tsx:135`); drop redundant `aria-current` in `app/layout/AppSidebar.tsx:22`; add a test for the wrong-scope plural redirect.

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
- [x] NS-1: selector on namespaced lists only; "All projects" + projects of `dev-1`; namespaces on `lab-1`; search filters.
- [x] NS-2: choosing `shop` on all-namespaces Pods → `/c/dev-1/k8s/ns/shop/pods` (search kept); nav "Pods" later
      opens `/k8s/ns/shop/pods`; remembered separately per cluster.
- [x] NS-3: projects list 403 → message shown, typing `shop` + Enter navigates to `ns/shop`.
- [x] NS-4: `openshift-monitoring`, `kube-system`, `default` hidden until the toggle is on; toggle remembered.
- [x] A project created via `mockK8s.upsert` appears in the open menu (live).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 frontend-engineer: started; ff-merged cp/2-proxy-browser (T-0073).
- 2026-11-20 frontend-engineer: NamespaceSelector + useLastNamespace/useShowDefaultProjects/useProjectOptions; ProjectBar
  in list header, NamespaceRedirect uses remembered project; T-0072/T-0073 nits done. Fixed latent mock bug: aborted
  watches raised undici `!aborted` unhandled errors (watch response now chunked). check-fe green → in_review.

## Review
**APPROVE** (frontend-architect, round 1). check-fe green in the worktree (56 files / 626 tests, build ok). NS-1..4 met
(projects/namespaces source, URL-driven + remembered per cluster, 403 typed fallback with the spec text + DNS-label
check, default-project toggle per browser). Boundaries right: cluster-context imports only `shared`; resources uses
cluster-context's public index. Storage goes through `useStoredValue` (try/catch, malformed JSON → nothing remembered);
a deleted/unreadable remembered project falls back to the list's own empty/"Restricted access" state with the selector
available — acceptable (spec calls it a hint). Cluster switch keeps path + search (T-0072). Menu `role="listbox"` lands
on the `ul` (PF MenuList), footer switch outside it; no-match live region fine. Page reset without an effect.
Merge: `web/src/mocks/k8s/watch.ts` — keep the committed T-0075 version (fe46d9a, same header); drop this worktree's hunk.
Nits (optional):
- cluster-context/NamespaceSelector.tsx:19 — import `dnsLabel` from `@/shared/forms` (public index) rather than the module path.
- resources/list/ResourceListPage.tsx (ProjectBar effect) — skip the write when the stored value already equals `selected` (avoids a redundant storage write per map change).

## Handover notes
- `NamespaceSelector` is controlled; `ProjectBar` (in `ResourceListPage.tsx`) maps `onSelect` to `resourcePath` and
  writes `useLastNamespace` (`"#all"` = all). Not shown for cluster-scoped kinds (none registered yet → untestable).
- Project list is fetched/watched only while the menu is open (`useProjectOptions(cluster, isOpen)`), waits for
  discovery; noun "Project" while discovery is pending, "Namespace" on vanilla K8s.
- NS-3 fallback triggers on any list error without data; Enter validates with `dnsLabel(63)`.
- `NoMatchStatus` (sr-only `role=status`, PF `pf-v6-screen-reader`) announces "No … match" in both menus.
- Mock fix outside paths: `mocks/k8s/watch.ts` sends `Transfer-Encoding: chunked`. Any watch abort followed by ≥100 ms
  of test time raised undici's `assert(!this.aborted)` (MSW ends the unframed body on cancel). Human: confirm the
  browser MSW worker still streams watches (`npm run dev`, Pods page shows "Live").
- `app/layout/AppSidebar.tsx`: dropped redundant `aria-current` (PF NavItem sets it on the cloned child).

