---
id: T-0018
title: Admin credentials API — add, rotate, delete, per-cluster and fleet lists, JWT metadata, write-only guarantees
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0015]
paths: [src/FleetConsole.Application/Credentials/, src/FleetConsole.Api/Endpoints/Admin/CredentialsAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/CredentialRequests.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, tests/FleetConsole.Application.Tests/Credentials/, tests/FleetConsole.Api.Tests/Integration/Admin/Credentials/, tests/FleetConsole.Api.Tests/Integration/TestData.cs, tests/FleetConsole.Application.Tests/ServiceProviderBuilder.cs, web/src/shared/api/schema.gen.ts]
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

**From T-0008 (architect review, 2026-11-19)** — the Domain as built; see T-0008's handover notes for details.
- `Credential.Rotate(token, fingerprint, metadata, clusterName, actor, now)` — note the `clusterName` argument
  (`cluster.Name.Value`). It is never a no-op: re-submitting the same token is a rotation and is audited.
- `name` → `CredentialName.Create` (message on `name`); `description` ≤ `Credential.MaxDescriptionLength` must be
  validated (the aggregate throws). Non-JWT tokens use `TokenMetadata.Opaque`. `TokenFingerprint.Create` failing means a
  bug in `TokenFingerprints.Compute`. Expiry status: `TokenMetadata.StatusAt(clock.UtcNow, window)`.

**From T-0015 (architect review, 2026-11-19)** — the integration-test harness (`tests/FleetConsole.Api.Tests/Integration/`).
See T-0015's handover notes for details.
- Test classes use `[Collection(ApiCollectionDefinition.Name)]` and take the shared `ApiFactory factory`. Tests in the
  collection run sequentially over **one shared database**, so use unique names (the helpers generate them) and never
  assume an empty table.
- **Logging in:** `await factory.LoginAsAsync(username)` returns a browser client (cookies, no auto-redirect,
  `X-Console-Request: 1`) that holds a session. Users must exist in the emulator. Use `factory.NewUsername()` for a
  regular user and `factory.NewAdminUsername()` for an admin **by configuration** (group `fleetconsole-admins`; can't be
  demoted → 409 `Users.AdminViaConfiguration`). For an admin **by assignment**, first
  `var u = await factory.Data.UserAsync(role: UserRole.Admin)`, then `LoginAsAsync(u.Username)`. For a read-only admin,
  add `isReadOnly: true`. Shipped users (`admin/alice/bob/ines`) are shared by all tests: use them for read-only
  assertions only.
- **Seeding below HTTP:** `factory.Data` (`TestData`): `UserAsync`, `DeactivateAsync`, `ReactivateAsync`,
  `SetReadOnlyAsync`, `SetRoleAsync`, `ClusterAsync`, `CredentialAsync` (encrypted via `ITokenProtector`; returns the
  plaintext token for CRED-2 scans), `GrantAsync`, `FindUserAsync`, `AuditEntriesAsync(name)`. Each call saves in its own
  signed-in scope (actor `test-data`), so seeding writes audit entries too. Filter audit assertions by name or action.
- **Other configuration** (e.g. `Auth:RevalidationInterval=00:00:00` so a role/read-only change is visible on the next
  request): `await using var host = await factory.CreateVariantAsync(overrides)` gives its own database and emulator.
  Each variant costs a migration run (~1 s). Create it once per class (`IAsyncLifetime`), not per test.
- **Secret leaks (CRED-2):** `TokenLeakScanner.AssertAbsent(secret, haystacks...)` over response bodies,
  `await TokenLeakScanner.DumpDatabaseAsync(factory.ConnectionString, ct)` (plaintext must not be in the DB) and
  `factory.Logs.AllText` (Debug and above).
- **Errors through HTTP:** assert `status`, `application/problem+json` and `code` (e.g. 401 `Auth.Unauthenticated`
  without a session, 403 `Auth.Forbidden` for non-admins, 403 `Auth.CsrfHeaderMissing` when the header is removed).
- After adding endpoints, regenerate `web/src/shared/api/schema.gen.ts` (`cd web && npm run gen:api`, Api running) and
  run `npm run typecheck` (ADR-0016).
- `TestData.CredentialAsync` computes the fingerprint inline (first 8 lowercase hex characters of SHA-256). When
  `TokenFingerprints.Compute` exists, switch `TestData` to it (add `tests/FleetConsole.Api.Tests/Integration/TestData.cs`
  to `paths`) so seeded and API-created credentials can't diverge.

## Acceptance criteria
- [x] Integration tests: add (JWT with exp/iat/sub → metadata, `serviceAccount` "ns/name"; opaque `sha256~...` →
      `tokenType: opaque`, status `unknown`), 400 token rules (empty, internal whitespace, > 16 KiB), 409 `NameTaken`,
      rotate keeps id + grants and audits old→new fingerprint, stale version 409, delete unused 204, delete used 409.
- [x] CRED-2: after add **and** rotate, the bodies of `GET /api/admin/credentials`, `/clusters`, `/clusters/{name}`,
      `/clusters/{name}/credentials` don't contain the token (T-0015's `TokenLeakScanner`; `/clusters` and
      `/clusters/{name}` only if T-0017 has merged — otherwise QA covers them); captured logs don't either.
- [x] CRED-4 expiry statuses incl. `expiringSoon` at `ExpiryWarningDays` boundary (fake clock).
- [x] CRED-7 fleet list sorted by expiry ascending, nulls last.
- [x] Unit tests for `TokenInspector` (malformed segments, non-JSON, missing claims, numeric date edge cases).
- [ ] Read-only admin 403 on commands. `schema.gen.ts` regenerated. Build, lint and tests green (rule 4).
      (403 + build/tests done; `schema.gen.ts` regeneration left to the orchestrator after merge, as instructed.)

## Contract amendments (orchestrator 2026-11-18)
- `CredentialDto` gains `ExpiryWarningDays` (int, from `Credentials:ExpiryWarningDays`) — contract §8.3.
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log
- 2026-11-19 backend-engineer: started in worktree `agent-af76dd13c9f3efd52` (from b1f8062); Application layer written, then paused (session end).
- 2026-11-19 backend-engineer: resumed. Api endpoints + requests, unit tests (inspector, fingerprint, validators, handlers),
  integration tests (incl. CRED-2 leak scan, CRED-4 manual clock, CRED-7), TestData → TokenFingerprints/TokenInspector.
  Outside paths (minimal): ServiceProviderBuilder registers substitutes for the new handlers' ports. check-be green.

## Review
**Round 1 — backend-architect, 2026-11-19: APPROVE.** check-be green (build ok; 323 + 260 + 442 tests).
Token only as `SensitiveString`/fingerprint in commands, DTOs, audit, validation messages and exceptions; projection never
selects the ciphertext; CRED-2 scan covers bodies (incl. a 400), DB dump and logs. Delete race: grants→credentials FK
`NoAction` → 23503 → 409 `Concurrency.Conflict`. Version check + `xmin`, one audit event per change, no N+1. Layering ok.
Optional nits (no re-review needed):
- tests/FleetConsole.Application.Tests/ServiceProviderBuilder.cs:51-54 — T-0016/T-0017 likely register the same ports (`IClusterRepository`, `IGrantRepository`) — at merge, keep one block of port registrations, no duplicates.
- src/FleetConsole.Api/Endpoints/Admin/CredentialsAdminEndpoints.cs:41-42 — `{credentialId:guid}` makes a malformed id a bare routing 404, not ProblemDetails `Credentials.NotFound`. Align with whatever T-0016/T-0017 do for route ids (follow-up if a convention is needed).
- Orchestrator: regenerate `schema.gen.ts` + `npm run typecheck` after the T-0016/17/18 merge (last AC still open by design).

## Handover notes
**State: in_review.** Worktree `agent-af76dd13c9f3efd52`, uncommitted. `scripts/check-be.sh` green (Testcontainers on podman).
- Api: `Endpoints/Admin/CredentialsAdminEndpoints.cs` (tag `Credentials`, OperationIds per contract; `GET /credentials` on the admin
  group, the rest in group `/clusters/{name}/credentials`), `CredentialRequests.cs`; one line in `AdminEndpoints.cs`.
  Endpoint trims the token (null → "") and wraps it in `SensitiveString`; add/rotate re-query `GetCredentialQuery`.
- Rulings applied: token trimmed by the endpoint, then required → no whitespace → ≤16384 → printable ASCII (fixed messages).
  JWT with a present but unreadable `exp` → `Opaque`/`unknown` (documented in `TokenInspector` remarks); an **absent** `exp`
  stays `noExpiry` as the Domain/contract define it.
- Merge points with T-0016/T-0017: `AdminEndpoints.cs` (one `Map…` line) and `ServiceProviderBuilder.cs` (4 substitute
  registrations — dedupe if the other tasks add the same ports).
- `TestData.CredentialAsync` now uses `TokenFingerprints.Compute` + `TokenInspector.Inspect` (seeded JWTs get metadata).
- Not done: `schema.gen.ts` regeneration + `npm run typecheck` (orchestrator after merge). CRED-2 scan of `/clusters` and
  `/clusters/{name}` waits for T-0017 (QA). EF translation of `CredentialProjection` verified against Postgres by the tests.
