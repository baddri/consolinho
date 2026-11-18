---
id: T-0018
title: Admin credentials API — add, rotate, delete, per-cluster and fleet lists, JWT metadata, write-only guarantees
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0015]
paths: [src/FleetConsole.Application/Credentials/, src/FleetConsole.Api/Endpoints/Admin/CredentialsAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/CredentialRequests.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, tests/FleetConsole.Application.Tests/Credentials/, tests/FleetConsole.Api.Tests/Integration/Admin/Credentials/, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
Store ServiceAccount tokens encrypted and write-only, show safe metadata (fingerprint, SA identity, expiry), rotate in
place and delete only when unused (CRED-1..8 API side). **Wave W6** (critical path → T-0020), parallel with T-0016,
T-0017.

## Scope
- In: contract §8.3–§8.4 except the two test endpoints (T-0020): `GET /api/admin/credentials`,
  `GET|POST /api/admin/clusters/{name}/credentials`, `PUT .../{credentialId}/token`, `DELETE .../{credentialId}`.
  `TokenInspector` and fingerprint computation.
- Out: connection testing (T-0020). Use the shared `ConnectionTestSummaryMapping` (T-0012).

## Contract / design notes
Contract §2, §3, §8.3, §8.4. ADR-0004 (fingerprint = first 8 hex chars of SHA-256, lowercase), ADR-0013 §11
(`SensitiveString`), SECURITY.md token handling.

| Use case (`Application/Credentials/...`) | Request | Response |
|---|---|---|
| `ListCredentials` | `ListCredentialsQuery(string? ClusterName)` (null = fleet) | `IReadOnlyList<CredentialDto>` (Clusters.NotFound when a given cluster doesn't exist) |
| `AddCredential` | `AddCredentialCommand(string ClusterName, string Name, string? Description, SensitiveString Token)` | `CredentialDto` |
| `RotateCredentialToken` | `RotateCredentialTokenCommand(string ClusterName, Guid CredentialId, SensitiveString Token, uint Version)` | `CredentialDto` |
| `DeleteCredential` | `DeleteCredentialCommand(string ClusterName, Guid CredentialId)` | `Result` |

> **Response shapes (ADR-0013 §5):** the "Response" column is what the *endpoint* returns. Commands return only the key
> (`Result<string>` username/name, `Result<Guid>` id) or `Result`; the endpoint then dispatches the matching `Get…`
> query so `version` is the post-commit value.

- `Application/Credentials/Tokens/TokenInspector.Inspect(SensitiveString token) : TokenMetadata` — JWT = three
  base64url segments whose header decodes to JSON with `alg`; read `exp`, `iat`, `sub` from the payload without
  signature validation; anything else → `Opaque` with null fields. Never throws on garbage input.
- `TokenFingerprints.Compute(SensitiveString) : TokenFingerprint`.
- Validators: token rules of contract §8.4 on the **trimmed** value (the endpoint trims before wrapping). Validation
  messages never echo the token.
- Endpoint builds `SensitiveString` from the request body; request records are not logged anywhere (keep it so).
- `{credentialId}` belonging to another cluster → `Credentials.NotFound`.
- Delete: `CountByCredentialAsync` → `MarkForDeletion` (`Credentials.InUse` "Credential fleet-view is used by 3
  grants. Re-assign or revoke them first.").
- Endpoints `CredentialsAdminEndpoints.cs`, tag `Credentials`; OperationIds `ListCredentials` (fleet),
  `ListClusterCredentials`, `AddCredential`, `RotateCredentialToken`, `DeleteCredential`.

## Acceptance criteria
- [ ] Integration tests: add (JWT with exp/iat/sub → metadata, `serviceAccount` "ns/name"; opaque `sha256~...` →
      `tokenType: opaque`, status `unknown`), 400 token rules (empty, internal whitespace, > 16 KiB), 409 `NameTaken`,
      rotate keeps id + grants and audits old→new fingerprint, stale version 409, delete unused 204, delete used 409.
- [ ] CRED-2: after add **and** rotate, the bodies of `GET /api/admin/credentials`, `/clusters`, `/clusters/{name}`,
      `/clusters/{name}/credentials` don't contain the token (T-0015's `TokenLeakScanner`; `/clusters` and
      `/clusters/{name}` only if T-0017 has merged — otherwise QA covers them); captured logs don't either.
- [ ] CRED-4 expiry statuses incl. `expiringSoon` at `ExpiryWarningDays` boundary (fake clock).
- [ ] CRED-7 fleet list sorted by expiry ascending, nulls last.
- [ ] Unit tests for `TokenInspector` (malformed segments, non-JSON, missing claims, numeric date edge cases).
- [ ] Read-only admin 403 on commands. `schema.gen.ts` regenerated. Build, lint and tests green (rule 4).

## Contract amendments (orchestrator 2026-11-18)
- `CredentialDto` gains `ExpiryWarningDays` (int, from `Credentials:ExpiryWarningDays`) — contract §8.3.
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log

## Review

## Handover notes
