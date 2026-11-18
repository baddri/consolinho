---
id: T-0037
title: Fleet credentials page (/admin/credentials) and the credential expiry alert
status: todo
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
- [ ] CRED-7: rows from all clusters in server order; links to the right cluster tab; filters incl. deep link.
- [ ] CRED-8: alert counts match fixtures on both pages; link applies both expiry filters; no alert when all OK
      (MSW override).
- [ ] QG-3 loading/empty/error. TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
