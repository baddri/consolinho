---
id: T-0037
title: Fleet credentials page (/admin/credentials) and the credential expiry alert
status: done
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0036, T-0033]
paths: [web/src/features/admin/credentials/, web/src/features/admin/clusters/ClustersListPage.tsx]
review_rounds: 0
---

## Goal
One list of every credential in the fleet sorted by soonest expiry (CRED-7), and a warning on the Clusters and
Credentials pages before tokens break (CRED-8). Backend counterpart: T-0018; MSW until then. **Parallel group F8**
(with T-0038, T-0039).

## Scope
- In: `CredentialsListPage.tsx`, `CredentialExpiryAlert.tsx`, `useFleetCredentials` in `credentials/api.ts`; alert
  placed on `ClustersListPage` (one line) and `CredentialsListPage`.
- Out: per-cluster actions (they stay on the cluster's Credentials tab; rows link there).

## Contract / design notes
Endpoint `GET /api/admin/credentials` → `Credential[]` (sorted by `expiresAt` asc, nulls last, then cluster, name).
Key `adminKeys.credentials()`.
- Columns: Cluster (`EnvironmentLabel` + name linking to `/admin/clusters/<name>/credentials`; "Disabled" label when
  `!clusterIsEnabled`), Name, Service account (reuse `ServiceAccountCell`), Fingerprint, Expiry
  (`CredentialExpiryLabel`), Grants, Last test (`LastTestLabel`).
- Default order = server order (CRED-7); sortable by expiry and cluster (`useClientSort`, nulls last).
- Filters: `q` over cluster/name/service account; `expiry` multi (`expired`,`expiringSoon`,`unknown`,`noExpiry`,
  `ok`); `env` multi.
- `CredentialExpiryAlert` (CRED-8): uses the fleet query; renders nothing when no `expired`/`expiringSoon`; else
  inline warning (danger if any expired) `Alert` "2 credentials expired, 3 expire soon" (pluralised; "expire within N
  days" only if the contract exposes the window — see NOTES gap) with `AlertActionLink` "Review credentials" →
  `/admin/credentials?expiry=expired&expiry=expiringSoon`.
- Empty: "No credentials yet" + link to Clusters.

## Acceptance criteria
- [x] CRED-7: rows from all clusters in server order; links to the right cluster tab; filters incl. deep link.
- [x] CRED-8: alert counts match fixtures on both pages; link applies both expiry filters; no alert when all OK
      (MSW override).
- [x] QG-3 loading/empty/error. TSDoc. Build, lint, tests green.

## Work log
- 2026-11-20 frontend-engineer: `useFleetCredentials`, `credentialFilters.ts`, `FleetCredentialRow`, `CredentialsListPage`,
  `CredentialExpiryAlert` (also on ClustersListPage); 12 page/alert tests. T-0036 nits: 404 rotate/delete tests, table
  hidden on load error, ClipboardCopy props wrapped. check-fe: typecheck/tests/build green; lint's only error is in
  T-0039's `grants/CredentialPicker.tsx:136` (concurrent, not this task).

## Review
- 2026-11-20 frontend-architect, round 1: **APPROVE**. Task-scoped vitest (37/37), typecheck and eslint on task paths
  green. URL filters (multi `expiry`/`env`, deep link), alert counts/variant/link, shared query key, T-0036 cell reuse,
  no tokens, no `any`, TSDoc all OK. `ok`→"Valid" and per-credential `expiryWarningDays` accepted. Optional nits:
  - credentials/api.ts:62 — nit — 404/409 invalidates only `clusterCredentials`; also invalidate `adminKeys.credentials()` so fleet list/alert drop the vanished credential.
  - credentials/credentialFilters.ts:4 — nit — `ENVIRONMENTS` duplicates the one in `clusters/clusterFilters.ts`; export and reuse it next to `ENVIRONMENT_OPTIONS`.
  - CredentialsListPage.test.tsx:32,38 — nit — `querySelector('[data-label=…]')` in helpers; prefer `within(row).getAllByRole('cell')` by index.
  - CredentialsListPage.test.tsx:197 — nit — also assert the action link's `href` (backs the "real `<a href>`, middle-click" claim).
  - ClustersListPage.tsx:74 / CredentialsListPage.tsx:61 — nit — the inline Alert sits directly on the toolbar; check spacing (e.g. `pf-v6-u-mb-md`) visually.

## Handover notes
- Contract gap resolved: `expiryWarningDays` is on every `Credential`, so the alert says "expire within N days"
  (N from the first expiring-soon credential). The "soon" fallback is only reachable with zero expiring credentials.
- Status enum is `ok` (not `valid`); filter option labels mirror `CredentialExpiryLabel` ("Valid" for `ok`).
- Default order = initial `useClientSort` on expiry asc (stable, nulls last) — identical to the server order, so
  no "unsorted" mode was needed in the shared kit.
- Alert renders nothing while loading or on error (pages show their own ErrorState); it reuses the fleet query key, so
  Clusters + Credentials share one request. "Review credentials" is a real `<a href>` (`AlertActionLink component`).
- Rows reuse `ServiceAccountCell`, `CredentialExpiryLabel`, `LastTestLabel`, `ClusterStatusLabel`; no row actions.
- `ENVIRONMENT_OPTIONS` imported from `clusters/clusterFilters` (same admin feature).
