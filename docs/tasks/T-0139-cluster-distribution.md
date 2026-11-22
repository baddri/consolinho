---
id: T-0139
title: Cluster distribution (OpenShift | Kubernetes) — domain, migration, admin + accessible-clusters API
status: done
owner: backend-engineer
checkpoint: 3.7
depends_on: []
paths: [src/FleetConsole.Domain/Clusters, src/FleetConsole.Application/Clusters, src/FleetConsole.Application/Audit/EventHandlers/ClusterAuditHandler.cs, src/FleetConsole.Infrastructure/Persistence, src/FleetConsole.Api/Endpoints/Admin/ClusterRequests.cs, src/FleetConsole.Api/Endpoints/Admin/ClustersAdminEndpoints.cs, tests/FleetConsole.Domain.Tests/Clusters, tests/FleetConsole.Application.Tests/Clusters, tests/FleetConsole.Api.Tests/Integration/Admin/Clusters]
review_rounds: 0
---

## Goal
Every cluster gets an admin-declared distribution (`OpenShift` | `Kubernetes`), presentation only (ADR-0032). The admin
API and the user-facing accessible-clusters API expose it so the SPA can show the `OCP`/`K8s` tag and theme. Spec CP3.7
DIST-1, DIST-2 (server side), DIST-4.

**This file holds the full CP3.7 backend contract (§Contract below) for the FE architect and T-0140..T-0142.**

## Scope
- In: `ClusterDistribution` enum, `Cluster.Distribution` + Register/Update, events/audit, EF mapping + migration,
  commands/validators/DTOs, Api request records, tests.
- Out: credential namespaces (T-0140/T-0141), detection in the connection test (T-0142), all FE.

## Contract (CP3.7, all backend tasks — FE regenerates types from OpenAPI)
JSON enums are camelCase strings; `Dto` suffix is stripped in OpenAPI schema names.

**A. Distribution (T-0139)**
- `enum ClusterDistribution { OpenShift, Kubernetes }` in `Domain/Clusters` → JSON `'openShift' | 'kubernetes'`.
- `POST /api/admin/clusters` (`RegisterClusterRequest`) and `PUT /api/admin/clusters/{name}` (`UpdateClusterRequest`):
  new property `distribution`, placed after `environment`. C# type `ClusterDistribution?` (no `[JsonRequired]`) so a
  missing/null value is a **400 validation ProblemDetails with field error `distribution`**: "Choose OpenShift or
  Kubernetes." (DIST-4). Generated TS will be `distribution?: ClusterDistribution | null` on the requests; the SPA always sends it.
- Responses gain non-null `distribution: ClusterDistribution` on `ClusterDetail` (GET/POST/PUT), `ClusterListItem`
  (GET list) and `AccessibleCluster` (`GET /api/clusters`). Place after `environment`.
- Update: a changed distribution adds `"distribution"` to `ClusterUpdated.changedFields` (after `environment`, request
  order) and does **not** move `ConnectionSettingsChangedAt` (DIST-2). `ClusterRegistered` gains `Distribution`; the
  `cluster.registered` audit details include `distribution`.
- Migration `ClusterDistribution`: column `clusters.distribution text NOT NULL`, existing rows `'OpenShift'` (enums are stored by
  name, `ConsoleDbContext.ConfigureConventions`).

**B. Inspect namespaces on the credential (T-0140)**
- Domain value object `InspectNamespaces` (`Domain/Credentials`): ordered, distinct, 0–10 entries, each trimmed and a
  DNS-1123 label ≤ 63 chars. `static Result<InspectNamespaces> Create(IEnumerable<string>? values)`; `Empty`;
  `IReadOnlyList<string> Values`. Errors are `ValidationError` keyed `inspectNamespaces` (too many: "Enter at most 10
  namespaces.") or `inspectNamespaces[i]` (i = index in the **input**; message names the entry: "'Team_A' is not a valid
  namespace name: at most 63 characters: lowercase letters, digits and '-', starting and ending with a letter or digit.").
  Normalisation: trim → reject blank/invalid → remove duplicates (first wins, order kept) → count ≤ 10.
- `Credential.InspectNamespaces` (never null, default empty). Column `credentials.inspect_namespaces text[] NOT NULL DEFAULT '{}'`.
- `POST /api/admin/clusters/{name}/credentials` (`AddCredentialRequest`): new optional `inspectNamespaces: string[] | null`
  (null/missing = empty) saved on the new credential (NST-5).
- `Credential` DTO: new `inspectNamespaces: string[]` (always present, possibly empty) after `description`.
- Rotation (`PUT .../token`) keeps the list.

**C. Connection tests (T-0141 namespaces, T-0142 distribution)**
- `POST /api/admin/clusters/{name}/credentials/{credentialId}/test` (`TestCredentialRequest`) and
  `POST /api/admin/clusters/{name}/test-token` (`TestTokenRequest`): `inspectNamespace: string?` is **replaced** by
  `inspectNamespaces: string[] | null` (null/missing = empty). Validation as in B (field keys `inspectNamespaces`,
  `inspectNamespaces[i]`); invalid → 400, nothing sent to the cluster (NST-2).
- Stored-credential test: the normalised list **replaces** the credential's saved list (empty clears it), in the same
  unit of work as `RecordTest` (NST-5). Unsaved-token test saves nothing.
- `ConnectionTestResult.namespaceRules` changes from `NamespaceRules | null` to **`NamespaceRules[]`** (always present;
  empty when no namespaces were given or the capabilities step didn't complete). One entry per requested namespace, in
  normalised input order:
  `NamespaceRules { namespace: string; incomplete: boolean; evaluationError: string | null; rules: ResourceRule[] | null; error: string | null; failureKind: ProbeFailureKind | null }`
  — exactly one of `rules` / `error` is non-null. `error` is the probe message (403, not found, timeout); `incomplete`
  is false on error.
- Capabilities step with namespaces: all reviewed → passed with today's summary; some failed → **warning**
  `"{summary}; rules reviewed in {ok} of {n} namespaces"`, `failureKind` = first failed entry's kind (NST-3).
- `ConnectionTestResult` gains **`detectedDistribution: ClusterDistribution | null`** (null when discovery was not
  readable or the test stopped before the step).
- `ConnectionTestStep` gains **`distribution`**, between `identity` and `openShiftVersion` (results now have 6 steps):
  - discovery readable, matches → passed: "OpenShift APIs served, as registered" / "No OpenShift APIs served, as registered";
  - mismatch → **warning** (DIST-7), verbatim: "The cluster serves OpenShift APIs but is registered as Kubernetes. Check
    the distribution." / "The cluster does not serve OpenShift APIs but is registered as OpenShift. Check the distribution.";
  - discovery not readable → warning "API discovery is not visible with this credential; the distribution was not checked"
    with the probe's `failureKind`. The step never fails except by the overall test timeout.
- `openShiftVersion` step (DIST-8): declared Kubernetes **and** detected ≠ OpenShift → `skipped`, message
  "Not an OpenShift cluster" (no ClusterVersion call). All other combinations unchanged.
- Audit: `credential.tested` and `credential.token_tested` details add `inspectNamespaces` (names only, NST-7);
  `credential.added` details add `inspectNamespaces`. The detected distribution is not audited (not a stored fact).

## Design notes (this task)
- Enum: `OpenShift = 0, Kubernetes = 1`, XML-doc like `ClusterEnvironment` (camelCase JSON, presentation only, ADR-0032).
  Domain guard `CheckDistribution` like `CheckEnvironment` (undefined value → `ArgumentOutOfRangeException`).
- `Cluster.Register(..., ClusterEnvironment environment, ClusterDistribution distribution, ...)` and same position in
  `Update`. Property `public ClusterDistribution Distribution { get; private set; }`.
- `IClusterSettings` gets `ClusterDistribution? Distribution { get; }`; `ClusterSettingsRules` adds
  `RuleFor(x => x.Distribution).NotNull().WithMessage("Choose OpenShift or Kubernetes.").IsInEnum()`. Handlers pass
  `request.Distribution!.Value` (validated before).
- Read models: add `c.Distribution` to the projections (no extra queries).

## Context pack
- Docs: `BACKEND.md` §Use case folder convention, §Results and errors, §Persistence (migrations L241-260); ADR-0032.
- Exemplars: `src/FleetConsole.Domain/Clusters/ClusterEnvironment.cs` (enum + docs); `Cluster.cs:CheckEnvironment` L292-295;
  env change detection `Cluster.cs:Update` L158-214; `ClusterSettingsRules.cs` L29-31 (rule shape).
- Touch points: `Cluster.cs:Register` L97-126, `Cluster.cs:Update` L140-214; `Domain/Clusters/Events/ClusterRegistered.cs`;
  `Application/Clusters/IClusterSettings.cs` L19; `RegisterCluster/RegisterClusterCommand.cs` L20-30 + `RegisterClusterHandler.cs` L48;
  `UpdateCluster/UpdateClusterCommand.cs` + `UpdateClusterHandler.cs` L41; `GetCluster/ClusterDetailDto.cs` L28 +
  `GetClusterHandler.cs` L43, L78; `ListClusters/ClusterListItemDto.cs` L23 + `ListClustersHandler.cs` L34, L61;
  `ListAccessibleClusters/AccessibleClusterDto.cs` L15 + `ListAccessibleClustersHandler.cs` L39-50;
  `Audit/EventHandlers/ClusterAuditHandler.cs:Handle(ClusterRegistered)` L28;
  `Infrastructure/Persistence/Configurations/ClusterConfiguration.cs` L39 (add `Distribution` `.IsRequired()`);
  `Api/Endpoints/Admin/ClusterRequests.cs` L22-50 (+ the `[JsonRequired]` header comment: explain why distribution differs);
  `Api/Endpoints/Admin/ClustersAdminEndpoints.cs:RegisterCluster` L67-80 and `UpdateCluster` (map to command).
- Migration: `dotnet tool restore && dotnet ef migrations add ClusterDistribution -p src/FleetConsole.Infrastructure -s src/FleetConsole.Api -o Persistence/Migrations`;
  then check the generated `AddColumn` has `defaultValue: "OpenShift"` (edit if EF emitted `""`).
- Tests: `tests/FleetConsole.Domain.Tests/Clusters/ClusterTests.cs`, `tests/FleetConsole.Application.Tests/Clusters/ClusterValidatorTests.cs`,
  `ClusterCommandHandlerTests.cs`, `tests/FleetConsole.Api.Tests/Integration/Admin/Clusters/RegisterClusterTests.cs`,
  `UpdateClusterTests.cs`, `ClusterQueriesTests.cs`, `ClusterTestSupport.cs` (request builders: add the field there once).

## Acceptance criteria
- [x] Domain: only defined values accepted; Register stores it; Update with a changed distribution raises `ClusterUpdated`
      with `distribution` and leaves `ConnectionSettingsChangedAt` unchanged (DIST-1, DIST-2).
- [x] Migration adds the column; existing rows read back as `OpenShift`.
- [x] Register/Update without `distribution` → 400 field error `distribution`; with `"kubernetes"` → stored and returned
      by GET detail, list and `GET /api/clusters` (DIST-4). Unknown string (`"rancher"`) → 400.
- [x] `cluster.registered` audit details contain `distribution`.
- [x] XML docs on new members (they flow to the OpenAPI document / `schema.gen.ts`).
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 backend-engineer: started; implemented §Contract A (enum, aggregate, event/audit, EF + migration
  `ClusterDistribution` with default `'OpenShift'`, validator rule, DTOs/projections, nullable request field).
- 2026-11-23: outside `paths` (call-site updates only): `tests/.../Integration/TestData.cs` (+`distribution` param),
  `Integration/Clusters/ClustersEndpointsTests.cs` (field list + distribution test), `Persistence/*TestData|RoundTrip`,
  `Domain.Tests/DomainTestData.cs`, `Application.Tests/Audit/ClusterAuditHandlerTests.cs`, `Credentials/*HandlerTests.cs`.

## Review
- 2026-11-23 backend-architect, round 1: **APPROVE**. Contract A and ADR-0032 met: enum + domain guard, Register/Update
  order, `changedFields` order, no staleness move, event/audit, EF mapping, migration default `'OpenShift'` (verified by
  the information_schema test), nullable request field → validator field error, projections without extra queries.
  `scripts/check-be.sh` green (326/687/778). Out-of-path test edits are call-site updates only — accepted.
  Reviewer fix: reworded the `ClusterRequests.cs` header comment (rationale is the DIST-4 field error, not pre-existing rows).
  Optional nit: the migration's DB-level default is kept after the backfill (harmless; the model always writes the value).

## Handover notes
- Contract A implemented as written; no deviations. `scripts/check-be.sh` green (Testcontainers via podman ran).
- Request `distribution` is `ClusterDistribution?` without `[JsonRequired]` (comment in `ClusterRequests.cs` explains);
  missing/null → 400 `Validation.Failed` with `errors.distribution` "Choose OpenShift or Kubernetes."; unknown string
  (`"rancher"`) → 400 binding ProblemDetails (no field key), same as unknown `environment`.
- `Cluster.Register/Update` take `ClusterDistribution` right after `environment`; `ClusterRegistered` gains
  `Distribution` (positional, after `Environment`). `changedFields` order: displayName, apiUrl, environment,
  distribution, webConsoleUrl, description, caBundle, skipTlsVerify. Distribution change never moves
  `ConnectionSettingsChangedAt`.
- Migration `20261122173511_ClusterDistribution` (`defaultValue: "OpenShift"`, hand-edited from `""`); covered by an
  information_schema test in `ClusterQueriesTests`.
- `TestData.ClusterAsync(..., distribution = OpenShift)` and `ClusterTestSupport` bodies send `"openShift"` — T-0142
  can seed Kubernetes clusters through that parameter. FE must regenerate `schema.gen.ts` (T-0146).
