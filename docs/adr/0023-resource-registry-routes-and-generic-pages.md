# 0023 — Resource registry, OCP-shaped routes and generic resource pages
**Status:** Accepted (2026-11-20) · **Builds on:** 0014, 0022 · **Spec:** CP2 DATA-1/2, UI-1..10, SW-9, NS-2

## Context
CP2 proves one generic list/details/YAML/events implementation on six kinds (DATA-1) behind OCP-shaped URLs (UI-1,
US-11). FRONTEND.md sketched a registry and a `/c/:cluster/ns/:namespace/:resource` route table in CP0; the spec now
fixes the `/k8s/...` URL shape and the nav contents, so both are settled here.

## Decision
1. **Routes** (children of `c/:cluster` inside `ClusterGate`, page modules lazy-loaded via `features/resources/routes.tsx`):
   ```
   (index)                               ClusterLanding → k8s/cluster/projects if served, else k8s/cluster/namespaces
   k8s/:plural                           NamespaceRedirect → ns/<last ns>/:plural | all-namespaces/:plural | cluster/:plural
   k8s/all-namespaces/:plural            list (all namespaces)
   k8s/ns/:namespace/:plural             list (one namespace)
   k8s/ns/:namespace/:plural/:name       details; child segments yaml | events (route handle { tab })
   k8s/cluster/:plural[/:name[/yaml|/events]]   cluster-scoped kinds
   ```
   A namespaced plural under `k8s/cluster/` (or the reverse) redirects to the right shape. Unknown plural → "Kind not
   supported yet" empty state; registered kind the cluster doesn't serve → "`<Kinds>` aren't available on `<cluster>`".
   SPA paths are built only by `features/resources/paths.ts:resourcePath()`. The old `ns/:namespace/:resource` and
   `cluster/:resource` placeholders go away; `overview`/`search` stay as unlisted placeholders until CP5.
2. **URL state of list pages:** `?name=` (client-side name substring), `?label=` (sent as `labelSelector`), plus
   descriptor filters (`?status=`, `?type=`) through `shared/table` `useUrlFilters`; pagination and sort stay local.
   Switching cluster keeps path **and** search (SW-9).
3. **Descriptor shape** (`features/resources/registry/types.ts`):
   ```ts
   interface ResourceDescriptor<T extends K8sResource = K8sResource> {
     model: K8sModel;                                   // shared/k8s/models.ts
     nav?: { section: 'home' | 'workloads' | 'networking' | 'administration'; order: number };
     columns: ColumnDef<T>[];                           // helpers: nameColumn, namespaceColumn, ageColumn, labelsColumn
     filters?: RowFilter<T>[];                          // checkbox filters, e.g. pod status, event type
     defaultSort?: { columnId: string; direction: 'asc' | 'desc' };
     status?: (obj: T) => ResourceStatus | undefined;   // { title, color } — header label + list Status cell
     DetailsSection?: ComponentType<{ obj: T }>;        // kind-specific part of the Details tab
     hasEventsTab?: boolean;                            // default true (false for Event)
     deleteRequiresName?: boolean;                      // type-to-confirm (Namespace, Project)
   }
   interface ColumnDef<T> { id: string; title: string; cell: (obj: T) => ReactNode;
     sortValue?: (obj: T) => string | number | null; allNamespacesOnly?: boolean; width?: 10|15|20|25|30|40 }
   interface RowFilter<T> { id: string; title: string; options: FilterOption[]; matches: (obj: T, values: string[]) => boolean }
   ```
   The registry (`registry/registry.ts`) is a plain array of descriptors with `descriptorForPlural(plural)` and
   `descriptorForKind(apiVersion, kind)` (for owner/involved-object links). Plurals are unique in the registry
   (unit-tested); a collision later moves URLs to OCP's `group~version~kind` refs via a new ADR.
4. **Generic actions, not per-descriptor actions, in CP2:** every kind gets Edit YAML and Delete
   (`features/resources/actions/`), gated by `useResourceAccess` (session read-only → grant read-only → SSAR, UI-9).
   FRONTEND.md's `actions`/`detailTabs` fields arrive with CP4 kind-specific actions and tabs.
5. **Nav is derived from the registry + discovery** (`useClusterNav(cluster)` exported by `features/resources`), sections
   Home (Projects, Events), Workloads (Pods, Deployments, ConfigMaps), Networking (Services), Administration
   (Namespaces); the app sidebar appends "Fleet administration". Unregistered kinds are no longer listed.
6. **Project/namespace context** belongs to `features/cluster-context` (`NamespaceSelector`, `useLastNamespace`);
   `features/resources` renders it on namespaced list pages and uses it in `NamespaceRedirect`.

## Consequences
- Adding a kind with default columns = one `registry/kinds/<plural>.tsx` file + one line in `registry.ts`.
- Sidebar items for StatefulSets, Routes, PVs etc. disappear until their descriptors exist (spec UI-2, "tabs that do
  nothing erode trust").
- Router tests and any hard-coded `/c/:cluster/ns/...` links must move to `resourcePath()`.
