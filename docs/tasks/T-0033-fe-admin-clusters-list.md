---
id: T-0033
title: Admin clusters list (/admin/clusters) with enable/disable and delete
status: todo
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
`Clusters.NotDisabled`). Keys `adminKeys.clusters()`, `adminKeys.cluster(name)`. Grant/cluster mutations also
invalidate `['api','clusters']` (switcher).
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
- [ ] CLU-7: fixture rows render every column; disabled `dev-2` greyed with Disabled label; `staging-eu-1` shows "TLS
      not verified"; worst expiry icon and tooltip match the fixture; stale test label shown.
- [ ] Filters (text, env, status) + URL deep link `?env=production`.
- [ ] CLU-5: disable dialog text names cluster, environment and user count; success toast; row shows Disabled;
      switcher query invalidated.
- [ ] CLU-6: delete disabled for enabled clusters (tooltip); for `dev-2` requires typing the name, shows counts,
      DELETE sent with CSRF header; 409 `Clusters.NotDisabled` shown in the dialog.
- [ ] QG-3: loading, empty, error states. ADM-2: actions aria-disabled for `ines`.
- [ ] TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
