# 0013 — HTTP API conventions for CP1 and later (resources, concurrency, enums, pagination)
**Status:** Accepted (2026-11-18)

## Context
CP1 introduces ~35 endpoints that the SPA consumes through generated types (`schema.gen.ts`). The spec leaves the final
shape to the architects (§6). Conventions decided once avoid per-endpoint debates and keep the generated types clean.

## Decision
1. **Addressing.** Natural keys in URLs where users think in names: `/api/admin/users/{username}`,
   `/api/admin/clusters/{name}`. Credentials and grants use GUIDs (`{credentialId}`, `{grantId}`). Usernames are
   URL-encoded by the client (OCP usernames may contain `:` or `@`).
2. **One command per endpoint.** State transitions are explicit: `POST .../enable`, `.../disable`,
   `.../deactivate`, `.../reactivate`; single-attribute changes are `PUT` on a sub-resource (`.../role`,
   `.../read-only`, `.../token`); full edits are `PUT` on the resource. No generic `PATCH`. Each maps 1:1 to a command,
   an authorization rule and an audit action.
3. **Transitions are idempotent.** Re-applying the current state (enable an enabled cluster, set the same role)
   returns 200 with the unchanged resource and writes **no** audit entry (no event raised).
4. **Optimistic concurrency.** Every user/cluster/credential/grant representation carries `version` (uint32, backed
   by Postgres `xmin`). Every edit/transition request sends it back; a mismatch → 409 `Concurrency.Conflict` with a
   resource-specific `detail` ("This cluster was changed by someone else. Reload and try again."). Creates, deletes
   and revokes do not take a version. A race between load and save is caught by EF's `xmin` check and mapped to the
   same 409 by `UnitOfWorkBehavior`.
5. **Responses.** Create → `201 Created` + `Location` + the created representation. Edit/transition → `200` + the
   updated representation (so the UI gets the new `version` without a refetch). Delete/revoke → `204`.
   Commands with no representation (logout) → `204`.
   **How:** commands return only the key (`Result<Guid>` / `Result<string>`) or `Result`; the endpoint then dispatches
   the matching `Get…Query` and returns its DTO. Reason: the handler runs *before* `UnitOfWorkBehavior` saves, so a DTO
   built inside the handler would carry the old `version` (`xmin` changes on write). One extra indexed read per edit.
6. **Enums are camelCase JSON strings** API-wide (`JsonStringEnumConverter(JsonNamingPolicy.CamelCase)`, no integer
   fallback), e.g. `"production"`, `"readOnly"`, `"expiringSoon"`. Unknown values in requests → 400.
7. **Lists.** Bounded collections (users, clusters, credentials, grants: tens to low hundreds) return a plain JSON
   array; the UI filters/sorts client-side. Unbounded collections (audit) use keyset pagination with an opaque cursor:
   `{ "items": [...], "nextCursor": "..." | null }`, `limit` default 50, max 200.
8. **Errors.** RFC 9457 ProblemDetails (existing mapping) with stable `code` `<Area>.<Reason>`. Unknown ids in the
   **route** → 404; unknown or invalid references in the **body** (e.g. a credential id in a grant request) → 400 with
   a field error on that property, so forms can show it inline. Catalogue: `docs/specs/CP1-api-contract.md` §2.
9. **Where types live.** Response DTOs: Application, `public sealed record <Name>Dto` (schema name drops `Dto`).
   Request bodies: Api, `public sealed record <Action>Request` next to the endpoint file; the endpoint combines route
   values + body into the command. Commands are never bound directly from HTTP.
10. **Times** are `DateTimeOffset` in UTC, ISO 8601. Ids are GUIDs (`format: uuid`).
11. **Secrets in requests** (SA tokens) cross into the Application layer as `SensitiveString`, whose `ToString()` is
    `"[redacted]"`, so a record's compiler-generated `ToString` can never print them.

## Consequences
- The contract doc (`docs/specs/CP1-api-contract.md`) is the design-time source; the running Api's OpenAPI document is
  the final source and the SPA regenerates `schema.gen.ts` from it after every backend task.
- Adding a state transition later = one endpoint + one command, never a change to an existing request shape.
