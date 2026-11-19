---
id: T-0021
title: Audit log query API — filters and keyset pagination
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: [T-0013, T-0015]
paths: [src/FleetConsole.Application/Audit/ListAuditEntries/, src/FleetConsole.Api/Endpoints/Admin/AuditAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, tests/FleetConsole.Application.Tests/Audit/ListAuditEntries/, tests/FleetConsole.Api.Tests/Integration/Admin/Audit/, web/src/shared/api/schema.gen.ts]
review_rounds: 0
---

## Goal
Expose the audit log to admins and read-only admins with the filters and stable pagination of AUD-4/AUD-5, so the
auditor persona can review history and the user/cluster pages can deep-link into a filtered view. **Wave W6**,
parallel with the other admin API tasks.

## Scope
- In: `GET /api/admin/audit` per contract §10.
- Out: export, retention, any write endpoint (AUD-3 — there is none, and the anonymous/admin surface tests keep it so).

## Contract / design notes
Contract §10 (params, records, actions). ADR-0013 §7 (cursor envelope).
```csharp
public sealed record ListAuditEntriesQuery(string? Actor, string? User, AuditCategory? Category, string? Cluster,
    string? Target, DateTimeOffset? From, DateTimeOffset? To, string? Cursor, int Limit = 50)
    : IQuery<AuditPageDto>, IAdminRequest;      // query → read-only admins allowed (AUD-5)
```
- Endpoint binds query-string parameters with `[AsParameters]` into an Api request record, then builds the query.
  OperationId `ListAuditEntries`, tag `Audit`.
- Ordering `occurred_at DESC, id DESC`; cursor = base64url of `"{occurredAt:O}|{id}"` of the last item; next page
  condition `(occurred_at, id) < (cursorTime, cursorId)` (row-value comparison translates in Npgsql). Fetch
  `limit + 1` to know whether `nextCursor` is null. Invalid cursor → 400 field error `cursor`.
- `user` filter: `actor_name = user OR (target_type = 'user' AND target_name = user)`. `target`: `ILIKE` substring
  (escape `%`/`_`). `Details` returned as `JsonElement` parsed from the stored jsonb string; check the OpenAPI schema
  renders it as an unconstrained value (document the TS type `unknown`/`Record<string, unknown>` in the handover for FE).
- Validator: `limit` 1–200; `from < to` when both given.

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

## Acceptance criteria
- [ ] Integration tests: newest first; every filter alone and combined; `user` matches actor or target; time range
      half-open; pagination over > 2 pages has no duplicates/gaps **while new entries are inserted between page
      requests**; `nextCursor` null on the last page; 400 for bad `limit`/`cursor`.
- [ ] AUD-5: read-only admin 200; non-admin 403; anonymous 401.
- [ ] AUD-2: entries expose actor, `actorIsSystem`, action, category, target, cluster, summary, correlation id
      (equals the request trace id of the command that wrote it), details object.
- [ ] CRED-2: `TokenLeakScanner` over audit responses after credential add/rotate/test seeds.
- [ ] Query plan sanity: filtered by cluster uses the index (EXPLAIN in a test or a work-log note).
- [ ] `schema.gen.ts` regenerated. Build, lint and tests green (CLAUDE.md rule 4).

## Contract amendments (orchestrator 2026-11-18)
- `user` filter matches actor OR the related-username column (target user, or grant's user) — contract §10 amendment 2026-11-19. Bind `category` as string and validate to a field error (not a framework 400), per contract §10.
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log

## Review

## Handover notes
