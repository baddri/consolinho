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
- Contract-first FE types (ADR-0016): after regenerating `schema.gen.ts`, also run `cd web && npm run typecheck`. A failure means the Api deviates from the contract — report it in NOTES, don't patch web/ silently.

## Work log

## Review

## Handover notes
