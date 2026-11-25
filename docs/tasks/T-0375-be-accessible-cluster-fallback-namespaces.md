---
id: T-0375
title: GET /api/clusters returns fallbackNamespaces (effective credential's inspect namespaces)
status: todo
owner: backend-engineer
checkpoint: 5.5
depends_on: []
paths: [src/FleetConsole.Application/Access, src/FleetConsole.Application/Clusters/ListAccessibleClusters, tests/FleetConsole.Application.Tests/Access, tests/FleetConsole.Application.Tests/Fleet, tests/FleetConsole.Api.Tests/Integration/Clusters, tests/FleetConsole.Api.Tests/Caching, docs/architecture/BACKEND.md]
review_rounds: 0
---

## Goal
A namespaced ServiceAccount (e.g. kind `team-a-editor`) cannot list namespaces, so the namespace selector has nothing to
offer. Expose, per accessible cluster, the inspect namespaces saved on the credential behind the caller's **effective**
grant (spec CP5.5 NSA-1..3, Q1/Q6) so the SPA can fall back to them in CP5.5b (NSF). Data comes from the cached access
snapshot (ADR-0040) — no new query, no cluster call.

## Scope
- In: snapshot row + resolved access carry the winner credential's inspect namespaces; `AccessibleClusterDto` gains
  `FallbackNamespaces`; cache invalidation on `CredentialTested`; cache key bump; tests; OpenAPI doc text.
- Out: SPA (T-0378 regenerates types); any admin UI/field for the list (Q1: reuse inspect namespaces); probing RBAC.

## Contract / design notes
**API (spec §4.4)** — `AccessibleCluster` (OpenAPI schema name unchanged) gains one **required** property:

| Field | Type | Meaning |
|---|---|---|
| `fallbackNamespaces` | `string[]` | Inspect namespaces of the credential behind the caller's effective grant (CP4.5 precedence), in saved order; `[]` if none. Used by the namespace selector only when listing namespaces is forbidden. |

No other request/route/error changes. Note: `FleetClusterStatusDto.Cluster` embeds `AccessibleClusterDto` by design
(T-0321, one mapping for switcher + fleet lines), so fleet status lines carry the field too — same user, same filter;
accepted, keep the shared mapping.

**Design (layer by layer)**
1. `AccessSnapshotRow` — append `IReadOnlyList<string> InspectNamespaces` (primitives only, JSON-cache safe). Doc it.
2. `LoadAccessSnapshotHandler` — project `cr.InspectNamespaces` (value object with EF converter, `text[]`) in the same
   single statement and map `[.. r.InspectNamespaces.Values]`. Still one SQL statement (ADR-0019).
3. `LoadAccessSnapshotQuery.CacheKey` — bump `access:v1:` → `access:v2:` (shape changed; the doc on the property says so).
   Update the asserted key in the two tests listed below.
4. `ResolvedClusterAccess` — append `IReadOnlyList<string> WinnerInspectNamespaces` (doc: names only, UI hint, the
   token still decides). `ClusterAccessReader.Resolve` fills it from `winner` (the winning row), never from another candidate.
5. `AccessibleClusterDto` — append `IReadOnlyList<string> FallbackNamespaces` with an API-consumer XML doc (text of the
   table above); `From` maps `access.WinnerInspectNamespaces`. Keep the "deliberately without API URL, CA or credential
   data" comment true: amend it to say the only credential-derived field is the inspect-namespace names (NSA-3).
6. `AccessCacheInvalidation` — handle `IPostCommitDomainEventHandler<CredentialTested>` → remove
   `CacheTags.Credential(domainEvent.CredentialId)` (NSA-2). Invalidate on every test (admin action, rare; no event shape
   change). Remove `CredentialTested` from the "not access relevant" list in `AccessCacheInvalidationTests` and update
   the class remark ("a rotated, tested or deleted credential → credential:{id}").
   `CredentialAdded` stays exempt (no grant uses a new credential yet).

Required: the field is required in OpenAPI (non-nullable list); verify the generated schema marks it required like the
other properties (see `OpenApi/SchemaNamingTests` for how schemas are asserted if needed).

## Context pack
- Docs: `BACKEND.md` § Recipes › Caching a query (L241-263); ADR-0040 §4-5; ADR-0034 (precedence).
- Touch points:
  - `src/FleetConsole.Application/Access/LoadAccessSnapshot/AccessSnapshot.cs:AccessSnapshotRow`
  - `src/FleetConsole.Application/Access/LoadAccessSnapshot/LoadAccessSnapshotHandler.cs:Handle` (L32-93 projection + map)
  - `src/FleetConsole.Application/Access/LoadAccessSnapshot/LoadAccessSnapshotQuery.cs:CacheKey` (L22-25)
  - `src/FleetConsole.Application/Access/ResolvedClusterAccess.cs` (record L29-42)
  - `src/FleetConsole.Application/Access/ClusterAccessReader.cs:Resolve` (L93-109, `winner` row)
  - `src/FleetConsole.Application/Clusters/ListAccessibleClusters/AccessibleClusterDto.cs:From`
  - `src/FleetConsole.Application/Access/AccessCacheInvalidation.cs` (interface list L27-41; copy `HandleAsync(CredentialRotated)` L129-133)
  - Domain source: `src/FleetConsole.Domain/Credentials/Credential.cs:InspectNamespaces` (L79), `InspectNamespaces.Values`
- Constructors to update in tests: `tests/FleetConsole.Application.Tests/Fleet/ClusterHealthProbeTests.cs:L229`,
  `tests/FleetConsole.Application.Tests/Fleet/GetFleetStatus/GetFleetStatusHandlerTests.cs:L176`.
- Key assertions to bump: `tests/FleetConsole.Application.Tests/Access/AccessSnapshotTests.cs:L30`,
  `tests/FleetConsole.Api.Tests/Caching/AccessCacheReplicaTests.cs:L137`.
- Test exemplars:
  - Application: `tests/FleetConsole.Application.Tests/Access/AccessSnapshotTests.cs:Reader_maps_the_row_back_to_value_objects` (L129) — add winner-vs-loser namespaces case (group grant loses to direct grant ⇒ direct grant's credential list).
  - Invalidation coverage: `tests/FleetConsole.Application.Tests/Access/AccessCacheInvalidationTests.cs` (exempt map L30).
  - API shape: `tests/FleetConsole.Api.Tests/Integration/Clusters/ClustersEndpointsTests.cs:Exposes_Only_Switcher_Fields` (L44; add `fallbackNamespaces` to the expected names) + helper `GrantedClusterAsync` (L126).
  - NSA-2 end to end: copy `tests/FleetConsole.Api.Tests/Caching/AccessCacheTests.cs:Rotated_credential_token_is_used_on_the_next_request` (L124) — warm `/api/clusters` (`[]`), admin runs `POST …/credentials/{id}/test` with `inspectNamespaces: ["team-a"]` against the fake server (see `ConnectionTestEndpointsTests.cs:TestCredential_OnKubernetesCluster_WithoutOpenShiftApis_SkipsClusterVersion` L163 for the fake Kubernetes server setup), then `/api/clusters` returns `["team-a"]`.
  - Seeding: `tests/FleetConsole.Api.Tests/Integration/TestData.cs:CredentialAsync` (L133) seeds `InspectNamespaces.Empty`; add an optional `IReadOnlyList<string>? inspectNamespaces = null` parameter if a test needs pre-seeded names.

## Acceptance criteria
- [ ] NSA-1: `/api/clusters` items have `fallbackNamespaces`, saved order, `[]` when none; effective (winning) grant's credential.
- [ ] NSA-2: re-testing a credential with new inspect namespaces is visible on the user's next `/api/clusters` (API test).
- [ ] NSA-3: only clusters the caller has a grant on (unchanged filter); admin without grants still gets `[]` list.
- [ ] Snapshot still one SQL statement (existing SQL-count test green); cache key `access:v2`.
- [ ] OpenAPI: `AccessibleCluster.fallbackNamespaces` required `string[]` with description; XML docs on every new member.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
