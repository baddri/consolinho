---
id: T-0383
title: Fallback landing and namespaced redirect — land in the last/first fallback namespace, "No namespaces available" state (NSF-3/4)
status: todo
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
- [ ] NSF-3: `/c/dev-k8s-ns` → `k8s/ns/team-a/pods`; with last namespace `team-b` stored → `k8s/ns/team-b/pods`;
  `k8s/deployments` → `k8s/ns/team-a/deployments`; `search` → `search/ns/team-a`; never `all-namespaces`.
- [ ] NSF-3: last stored as all (`#all`) → first fallback namespace.
- [ ] NSF-4: no fallback namespaces → empty state with exact copy; typing `team-a` and choosing Go-to opens
  `k8s/ns/team-a/pods`; no error toast rendered.
- [ ] OpenShift and listable Kubernetes landings unchanged (existing tests green).
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
