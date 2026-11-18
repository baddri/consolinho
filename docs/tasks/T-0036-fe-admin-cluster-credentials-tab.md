---
id: T-0036
title: Cluster Credentials tab — list, add, rotate, delete (write-only tokens)
status: todo
owner: frontend-engineer
checkpoint: 1
depends_on: [T-0035, T-0025]
paths: [web/src/features/admin/credentials/, web/src/features/admin/clusters/ClusterDetailPage.tsx]
review_rounds: 0
---

## Goal
Manage a cluster's ServiceAccount credentials safely (CRED-1, CRED-3..6, CRED-2 on the UI side): metadata at a
glance, tokens that are typed once and never shown again, rotation in place, and delete only when unused. Backend
counterpart: T-0018; MSW until then. **Parallel group F7** (with T-0032; T-0037/38/39 build on it).

## Scope
- In: `credentials/api.ts`, `ClusterCredentialsTab.tsx`, `AddCredentialModal`, `RotateCredentialModal` (without
  "Test new token" — T-0038), `DeleteCredentialModal`, `CredentialExpiryLabel`, `LastTestLabel`,
  `ServiceAccountCell`; wiring the tab into `ClusterDetailPage`.
- Out: fleet list + expiry alert (T-0037), testing (T-0038).

## Contract / design notes
Endpoints (contract §8.3/8.4): `GET /api/admin/clusters/{name}/credentials` → `Credential[]`;
`POST …/credentials` (`AddCredentialRequest` → 201 `Credential`; 409 `Credentials.NameTaken`);
`PUT …/credentials/{credentialId}/token` (`RotateCredentialTokenRequest` with `version` → 200); `DELETE
…/credentials/{credentialId}` (204; 409 `Credentials.InUse`); `GET …/clusters/{name}/grants` (affected users).
Keys `adminKeys.clusterCredentials(name)`, `adminKeys.clusterGrants(name)`.
- Table columns: Name (+ description subtle), Service account (`ServiceAccountCell`: `ns/name`; for `tokenType ===
  'opaque'` a warning label "Not a ServiceAccount token" with tooltip "Expiry unknown and it is tied to a person's
  account." — Q10), Fingerprint (monospace), Expiry (`CredentialExpiryLabel`: OK green with date / "Expires soon"
  warning / "Expired" danger / "No expiry" grey / "Unknown" grey — CRED-4, with `RelativeTime`), Grants (`grantCount`),
  Last test (`LastTestLabel`: Never tested / Passed + headline / Failed at `<step>` / stale "Settings changed since last
  test"), Rotated (`RelativeTime` + by). Kebab: Test (slot for T-0038), Rotate token, Delete.
- `AddCredentialModal` (RHF+zod): `name` (DNS label ≤ 63), `description` (≤ 1000), `token` — `TextField
  type="password"` with reveal toggle, `autoComplete="off"`, `spellCheck={false}`; client rules: trimmed, required,
  no internal whitespace ("The token must not contain spaces or line breaks."), ≤ 16384. (Spec says "masked
  textarea"; tokens have no whitespace, so a single-line password input gives real masking — see NOTES.) Submit sends
  the trimmed token. Response `tokenType === 'opaque'` → warning toast with the Q10 text.
- `RotateCredentialModal`: title "Rotate token of `fleet-view` on `prod-eu-1`" + env label; body shows current
  fingerprint and "N users are affected" (`grantCount`); new token field; sends `version`; conflict → `ConflictAlert`.
  Leave a footer slot for "Test new token" (T-0038).
- `DeleteCredentialModal`: when `grantCount > 0` → no delete button; lists the affected users from cluster grants
  filtered by `credentialId` (username, access mode) + hint "Re-assign or revoke these grants first." (CRED-6); else
  `ConfirmModal` danger "Delete credential `fleet-view` from `prod-eu-1`?". A 409 `Credentials.InUse` (race) shows the
  detail and the same list.
- **CRED-2 in the UI:** the token lives only in RHF state of the open modal; `reset()` on close and after success;
  never in query cache, toasts, URL, `console`, or error text. Mutation hooks must not put the request in a query key.
- Empty state: "No credentials — users can't be granted access until you add a ServiceAccount token" + "Add
  credential" + `ClipboardCopy` with `oc create token <service-account> -n <namespace> --duration=8760h`.

## Acceptance criteria
- [ ] CRED-3/4: fixture credentials show SA identity, fingerprint, all five expiry statuses, last-test variants.
- [ ] CRED-1: add with valid input → POST body trimmed, CSRF header, toast; whitespace token → client error; server
      field errors and NameTaken on `name`; opaque response → warning toast.
- [ ] CRED-2: after add/rotate the token value is not in the DOM (`queryByDisplayValue`) and not in any rendered text;
      reopening the modal shows an empty field.
- [ ] CRED-5 (part): rotate shows fingerprint and affected users, sends `version`, conflict handled (ADM-4).
- [ ] CRED-6: in-use credential lists affected users from grants, no DELETE sent; unused → confirm → 204 → row gone.
- [ ] QG-3 loading/empty/error; ADM-2 disabled actions for `ines`. TSDoc. Build, lint, tests green.

## Work log

## Review

## Handover notes
