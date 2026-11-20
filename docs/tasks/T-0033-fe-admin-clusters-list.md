---
id: T-0033
title: Admin clusters list (/admin/clusters) with enable/disable and delete
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0028, T-0026, T-0024]
paths: [web/src/features/admin/clusters/]
review_rounds: 0
---

## Goal
The fleet view of all registered clusters (CLU-7) with the lifecycle actions that don't need a form: enable/disable
(CLU-5) and delete (CLU-6). Backend counterpart: T-0017; MSW until then. **Parallel group F5.**

## Scope
- In: `clusters/api.ts` (list, detail, enable, disable, delete hooks), `ClustersListPage.tsx`, reusable dialogs
  `DisableClusterModal`, `EnableClusterModal`, `DeleteClusterModal`, labels `TlsModeLabel`, `ClusterStatusLabel`,
  `WorstExpiryIcon`, `LastTestCell`.
- Out: register/edit form (T-0034), detail page (T-0035), expiry alert (T-0037), Test connection item (T-0038 adds it).

## Contract / design notes
Endpoints: `GET /api/admin/clusters` → `ClusterListItem[]`; `GET /api/admin/clusters/{name}` (for `version`);
`POST …/{name}/enable|disable` (`VersionRequest` → `ClusterDetail`); `DELETE …/{name}` (204; 409
`Clusters.NotDisabled`). Keys `adminKeys.clusters()`, `adminKeys.cluster(name)`.
- **Switcher invalidation (T-0029 review):** enable, disable and delete `onSuccess` also invalidate
  `accessibleClustersQueryKey` (import from `@/features/cluster-context`, never the literal), so the admin's own switcher/landing/`ClusterGate` catch up without waiting
  for the 30 s stale time / 5 min interval. Put it in the shared mutation hooks in `clusters/api.ts` so T-0035
  (detail page Actions) inherits it.
- Columns (CLU-7): Name (link to detail) + display name (subtle text when different), Environment
  (`EnvironmentLabel`), API URL (truncate, full in tooltip), Status (Enabled / "Disabled" label; disabled rows use
  subtle text), TLS (`TlsModeLabel`: "CA bundle" / "System trust" / warning "TLS not verified" — CLU-3),
  Credentials (`credentialCount` + `WorstExpiryIcon` for `worstCredentialExpiryStatus` with tooltip), Users
  (`grantCount`), Last test (`LastTestCell`: success/failure icon + `RelativeTime` + `lastTestCredentialName`;
  "Settings changed since last test" warning label when `isStale`; "Never tested" when null).
- Filters: `q` over name/displayName/apiUrl; `env` multi; `status` multi (`enabled`,`disabled`). Sort by name.
- Toolbar action: primary "Register cluster" → `/admin/clusters/new` (aria-disabled for read-only admins).
- Kebab: Edit (→ `/admin/clusters/:name/edit`), Enable or Disable, Delete (aria-disabled while enabled with reason
  "Disable the cluster before deleting it.").
- `DisableClusterModal`: danger for production; title "Disable `prod-eu-1`" + `EnvironmentLabel`; body "Disable
  `prod-eu-1` (production)? N users will no longer see it in the cluster switcher." (N = `grantCount`).
- `DeleteClusterModal`: danger, `typeToConfirm` = cluster name, body "3 credentials and 14 grants will be removed."
  from `credentialCount`/`grantCount`.
- Version: list items have no `version` → `fetchQuery(cluster detail)` on confirm (same pattern as T-0031).
- Empty state (no clusters): "No clusters registered" + "Register cluster" + short text "You need the cluster's API
  URL, its CA bundle (or system trust) and a ServiceAccount token." 40+ rows must render without pagination jank
  (plain client-side table; no virtualization needed for ~40–100 rows).

## Acceptance criteria
- [x] CLU-7: fixture rows render every column; disabled `dev-2` greyed with Disabled label; `staging-eu-1` shows "TLS
      not verified"; worst expiry icon and tooltip match the fixture; stale test label shown.
- [x] Filters (text, env, status) + URL deep link `?env=production`.
- [x] CLU-5: disable dialog text names cluster, environment and user count; success toast; row shows Disabled;
      switcher query (`accessibleClustersQueryKey`) invalidated — asserted for enable, disable and delete.
- [x] CLU-6: delete disabled for enabled clusters (tooltip); for `dev-2` requires typing the name, shows counts,
      DELETE sent with CSRF header; 409 `Clusters.NotDisabled` shown in the dialog.
- [x] QG-3: loading, empty, error states. ADM-2: actions aria-disabled for `ines`.
- [x] TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: started; list items carry `version` (contract + T-0017 DTO), so dialogs use the row version (no fetchQuery).

- 2026-11-20 frontend-engineer: list page, api hooks, labels, Enable/Disable/Delete modals, `useClusterActions`; 17 tests (`ClustersListPage.test.tsx`, `ClusterActions.test.tsx`); `scripts/check-fe.sh` green → in_review.

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE**. Clusters tests 17/17, lint, typecheck and build green; the full
  gate's 5 failing files are all `admin/users/*` (T-0032 being edited concurrently, transform error), not this task.
  Deviation accepted: `ClusterListItem.version` is in the contract and pinned by `schema.test.ts`, so sending the row
  version is correct; a stale version gets a 409 and `invalidateAfterError` refetches the list (and its detail keys)
  so a retry uses the new version. Invalidation, URL filters, typed-name delete, aria-disabled items and the T-0035/T-0038 reuse hooks all meet the task.
  Optional nits (follow-ups, not blocking):
  - `web/src/features/admin/clusters/clusterTarget.ts:16` — `plural` is generic; move it to `@/shared/ui` once a second feature needs it (users dialogs inline it today).
  - `web/src/features/admin/clusters/api.ts:46` — a 404 from the list kebab refetches and the row (and its open dialog) unmounts without feedback; consider a toast "Cluster no longer exists" in T-0035.
  - `web/src/features/admin/clusters/ClusterActions.test.tsx:77` — assert the request body `{ version }` too, and add a status-filter case to `ClustersListPage.test.tsx` (only text + env are covered).
  - `web/src/features/admin/clusters/TlsModeLabel.tsx:208` — `status="warning"` already sets the colour; `color` is redundant there.

## Handover notes
- Deviation: list items DO carry `version` (contract + T-0017 `ClusterListItemDto`), so dialogs send the row's
  version; no `fetchQuery(cluster detail)` needed.
- `clusters/api.ts`: `useClusters`, `useCluster`, `useEnableCluster`, `useDisableCluster`, `useDeleteCluster`; all
  success paths invalidate `adminKeys.all` + `accessibleClustersQueryKey`; 404/409 refetch clusters, 403 refetches `me`.
- For T-0035: reuse `useClusterActions(cluster, onDeleted)` (items assignable to `IAction`, map to `DropdownItem`s;
  `onDeleted` to navigate away) and the three modals (accept `ClusterListItem | ClusterDetail`, see `clusterTarget.ts`).
- For T-0038: add "Test connection" as another item in `useClusterActions`.
- Disabled rows use `pf-v6-u-text-color-subtle` on the `Tr`; API URL uses PF `Truncate` (middle, tooltip when cut).
- Register cluster navigates to `/admin/clusters/new` (button, aria-disabled for read-only admins).
- Note: `scripts/check-fe.sh <path>` logs are shared across agents in `.git/checks/`; concurrent runs clobber them.
