---
id: T-0021
title: Audit log query API — filters and keyset pagination
status: done
owner: backend-engineer
checkpoint: 1
depends_on: [T-0013, T-0015]
paths: [src/FleetConsole.Application/Audit/ListAuditEntries/, src/FleetConsole.Api/Endpoints/Admin/AuditAdminEndpoints.cs, src/FleetConsole.Api/Endpoints/Admin/AdminEndpoints.cs, tests/FleetConsole.Application.Tests/Audit/ListAuditEntries/, tests/FleetConsole.Api.Tests/Integration/Admin/Audit/, web/src/shared/api/schema.gen.ts]
review_rounds: 2
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
- [x] Integration tests: newest first; every filter alone and combined; `user` matches actor or target; time range
      half-open; pagination over > 2 pages has no duplicates/gaps **while new entries are inserted between page
      requests**; `nextCursor` null on the last page; 400 for bad `limit`/`cursor`.
- [x] AUD-5: read-only admin 200; non-admin 403; anonymous 401.
- [x] AUD-2: entries expose actor, `actorIsSystem`, action, category, target, cluster, summary, correlation id
      (equals the request trace id of the command that wrote it), details object.
- [x] CRED-2: `TokenLeakScanner` over audit responses after credential add/rotate/test seeds.
- [x] Query plan sanity: filtered by cluster uses the index (EXPLAIN in a test or a work-log note).
- [ ] `schema.gen.ts` regenerated (left to orchestrator per instruction). Build and tests green: [x].

## Contract amendments (orchestrator 2026-11-18)
- `user` filter matches actor OR the related-username column (target user, or grant's user) — contract §10 amendment 2026-11-19. Bind `category` as string and validate to a field error (not a framework 400), per contract §10.
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log
- 2026-11-20 backend-engineer: implemented `Application/Audit/ListAuditEntries/` (query, handler, validator, cursor, DTOs), `AuditAdminEndpoints.cs`, unit + integration tests. One SQL statement; keyset `(occurred_at, id) <` spelled as `a < t OR (a = t AND id < cid)` (verified in logged SQL); EXPLAIN test asserts `ix_audit_entries_cluster_name` is usable.
- Outside `paths`: `Domain/Audit/AuditEntryId.cs` gained `IComparable` + `<,>,<=,>=` (needed for the id tiebreaker; EF translates it to `a.id < @id`).
- Deviations: query `Category` is `string?` (contract amendment: field error, not framework 400); `target` uses `lower(target_name) LIKE` with EF-escaped parameter instead of ILIKE (Application can't use `EF.Functions`). Credential "test" seed not covered by CRED-2 test: no test endpoint exists yet.
- `scripts/check-be.sh` green (566 Api tests). `schema.gen.ts` not regenerated (orchestrator does it).
- 2026-11-20 review round 1 fixes: cursor timestamp and `from`/`to` normalized with `ToUniversalTime()` (non-UTC offsets made Npgsql throw → 500); integration tests for `+02:00` range and tampered `+05:00` cursor (200); EXPLAIN/lower() comments. `check-be.sh` green (568 Api tests).

## Review
**Round 1 (backend-architect, 2026-11-20): CHANGES_REQUESTED.** `scripts/check-be.sh` green (323+349+566). Keyset order/tiebreak, limit+1, one-statement SQL, admin-only/read-only access, CRED-2 scan, layering and XML docs are good. Deviations accepted: string `category` (contract amendment), `lower() LIKE` with EF escaping, explicit camelCase `[FromQuery(Name)]`, framework 400 for unparseable typed params, `details` `oneOf [null, JsonElement]`. Domain `AuditEntryId : IComparable` + operators justified (EF needs the operator to translate the tiebreak; the paging integration test pins .NET Guid order = PostgreSQL uuid order).
1. `src/FleetConsole.Application/Audit/ListAuditEntries/AuditCursor.cs:47-55` — a tampered cursor with a non-zero offset (e.g. `2026-01-01T00:00:00.0000000+02:00|<guid>`) parses, and Npgsql (6+) throws when writing a non-UTC `DateTimeOffset` to `timestamptz` → 500 instead of the cursor 400/a valid page. Required: normalise in `TryParse` (`occurredAt.ToUniversalTime()`, or reject offset ≠ 0) + an integration test sending such a cursor (expect 200 or 400, never 500).
2. `src/FleetConsole.Application/Audit/ListAuditEntries/ListAuditEntriesHandler.cs:60-68` — same exposure for `from`/`to` if the binder keeps the caller's offset (`?from=…+02:00`, which a browser date picker may send). Required: normalise with `.ToUniversalTime()` in the handler (cheap, binder-independent) + one integration test with a `+02:00` `from` asserting 200 and correct half-open filtering.
3. (nit, optional) `tests/FleetConsole.Api.Tests/Integration/Admin/Audit/AuditEndpointsTests.cs:250` — EXPLAIN runs hand-written SQL, not the EF-generated statement; acceptable for the AC, but a note that it mirrors the handler's shape (or capturing the logged SQL) would keep it honest if the query changes.
4. (nit, optional) `ListAuditEntriesHandler.cs:54` — `ToLowerInvariant()` vs PostgreSQL `lower()` (collation-dependent) can differ for non-ASCII names; fine for K8s/usernames, worth one comment word.

**Round 2 (backend-architect, 2026-11-20): APPROVE.** Audit tests green (Api 41, Application 118). #1 fixed: `AuditCursor.TryParse` normalises to UTC. Normalising is better than rejecting here because it keeps the same instant, and a forged cursor only moves the start of a list the caller may already read. Covered by the unit test `Cursor_WithNonUtcOffset_IsNormalizedToUtc` and the integration test `TamperedCursor_WithNonUtcOffset_IsNotA500`. #2 fixed: the handler normalises `from`/`to`, and `TimeRange_WithNonUtcOffsets_IsNormalized_AndHalfOpen` covers it. Nits #3/#4 are done as comments. No new findings.

## Handover notes
- `GET /api/admin/audit` → `AuditPage { items: AuditEntry[], nextCursor: string | null }`; query params camelCase (`[FromQuery(Name=...)]`, otherwise `[AsParameters]` publishes PascalCase; a test pins the names).
- `details` renders as `oneOf [null, $ref JsonElement]` with `JsonElement: {}` → FE type should come out as `unknown | null`; treat it as `Record<string, unknown>` after a runtime object check.
- Validation errors keyed `limit`, `category`, `cursor`, `to` (from ≥ to). Malformed `from`/`to`/`limit` (non-parseable) are framework 400s without `errors` — typed binding kept for an honest OpenAPI schema.
- Cursor: base64url `"{occurredAt:O}|{id}"`, max 256 chars, unsigned (only moves the start point of a readable list).
- Category filter accepts camelCase names case-insensitively, rejects numerics.
- Test helper `Integration/Admin/Audit/AuditApi.cs`: one cached admin-by-assignment client per host (`AdminAsync`), `SeedAsync` for entries with chosen timestamps.
- Follow-up: add a CRED-2 audit scan for `credential.tested` once the connection-test endpoint lands.
