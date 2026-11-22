---
id: T-0142
title: Connection test detects the distribution from API discovery — distribution step, mismatch warning, ClusterVersion skip
status: done
owner: backend-engineer
checkpoint: 3.7
depends_on: [T-0139, T-0141]   # T-0141: both edit ConnectionTester.cs / result DTO
paths: [src/FleetConsole.Domain/Credentials/ConnectionTestStep.cs, src/FleetConsole.Application/Abstractions/Kubernetes, src/FleetConsole.Application/Credentials/ConnectionTesting, src/FleetConsole.Application/Credentials/TestCredential, src/FleetConsole.Application/Credentials/TestToken, src/FleetConsole.Infrastructure/Kubernetes/ClusterProbeSession.cs, tests/FleetConsole.Application.Tests/Credentials, tests/FleetConsole.Api.Tests/Kubernetes, tests/FleetConsole.Api.Tests/Integration/Admin/ConnectionTests]
review_rounds: 0
---

## Goal
Both connection tests read API discovery, detect the distribution (`config.openshift.io` served ⇒ OpenShift) and warn —
never fail — when it differs from the cluster's declared distribution; a declared-Kubernetes cluster without OpenShift
APIs skips the ClusterVersion step instead of warning (spec DIST-7, DIST-8; ADR-0032).

## Scope
- In: probe port + implementation for `GET /apis`, new `distribution` step, `detectedDistribution` on the result,
  ClusterVersion skip rule, declared distribution as tester input, tests.
- Out: any auto-correction of the declaration (spec Q3), FE.

## Contract / design notes
Contract: **T-0139 §Contract C** (distribution parts) — step `distribution` between `identity` and `openShiftVersion`,
messages verbatim, `detectedDistribution: ClusterDistribution | null`, DIST-8 skip message "Not an OpenShift cluster".
- Port: `IClusterProbeSession.GetServedApiGroupsAsync(CancellationToken) → Task<ProbeResponse<ServedApiGroups>>` with
  `public sealed record ServedApiGroups(IReadOnlyCollection<string> Names)` in `ProbeResults.cs`. Implementation:
  `GET apis` (relative, like `"version"`), DTO `{ groups: [{ name }] }`; empty/missing groups → empty set (not a failure).
- Tester input: replace `ConnectionOf(Cluster)` with `TargetOf(Cluster) → ConnectionTestTarget(ClusterConnection Connection,
  ClusterDistribution Distribution)` (record next to the tester); `RunAsync(ConnectionTestTarget target, …)`. Both handlers
  switch to it. (Keeps the probe port's `ClusterConnection` free of presentation data.)
- `ConnectionTestStep.Distribution = 5`, **declared** between `Identity` and `OpenShiftVersion` (values unchanged; the
  DB stores names, JSON uses names) with a comment why; `StepOrder` gets it in position 4.
- Step (after `ResolveIdentity`): success → `run.DetectedDistribution = groups.Contains("config.openshift.io") ?
  OpenShift : Kubernetes`, pass/warn per contract; any probe failure → warn "API discovery is not visible …" with the
  failure kind, detected stays null; continue either way. Message constants `public const` on the tester (tests assert them).
- ClusterVersion step: `if (declared == Kubernetes && run.DetectedDistribution != OpenShift)` → `Skip("Not an OpenShift
  cluster")` without calling the probe (add `TestRun.Skip(message)` → `ConnectionTestStepStatus.Skipped`); else as today.
  Update the stale "plain Kubernetes" wording in the step comment (L241).
- `ConnectionTestResultDto.DetectedDistribution` (XML doc: "presentation hint only; capabilities come from discovery").
- No audit or stored-summary change: the detected distribution is a per-run hint (contract C).

## Context pack
- Docs: ADR-0032 (§Decision 3–5), ADR-0011 (step model); spec DIST-7/8.
- Exemplars: `Infrastructure/Kubernetes/ClusterProbeSession.cs:GetClusterVersionAsync` L98-116 (GET + DTO mapping via `SendAsync`);
  `ConnectionTester.cs:CheckOpenShiftVersionAsync` L241-263 (step shape, warn vs fail).
- Touch points: `Application/Abstractions/Kubernetes/IClusterProbeSession.cs` L27-31 (add the method + XML doc),
  `ProbeResults.cs` L15; `Domain/Credentials/ConnectionTestStep.cs`; `ConnectionTester.cs` `StepOrder` L47-54,
  `ConnectionOf` L59-63, `RunAsync`, `RunStepsAsync` L143-165, `TestRun` L361-405; `ConnectionTestResultDto.cs` L21-31;
  `TestCredentialHandler.cs` / `TestTokenHandler.cs` (`tester.RunAsync` call).
- Tests: `tests/FleetConsole.Application.Tests/Credentials/ConnectionTesting/FakeProbeClient.cs` (add `ApiGroups` func,
  default = OpenShift groups so existing tests keep passing), `ConnectionTesterTests.cs`;
  `tests/FleetConsole.Api.Tests/Kubernetes/ClusterProbeClientTests.cs` L89-95 (+ its stub server's `MapClusterVersion`
  → add `MapApiGroups`); `tests/FleetConsole.Api.Tests/Integration/Admin/ConnectionTests/ConnectionTestEndpointsTests.cs`
  (the stub cluster used there must serve `/apis`).

## Acceptance criteria
- [x] Declared OpenShift + `config.openshift.io` served → `distribution` passed, `detectedDistribution: "openShift"`.
- [x] Declared Kubernetes + served → warning with the exact DIST-7 text; ClusterVersion runs as today; test succeeds.
- [x] Declared OpenShift + not served → reverse warning; ClusterVersion as today (warning if not visible).
- [x] Declared Kubernetes + not served → passed; `openShiftVersion` skipped "Not an OpenShift cluster", no ClusterVersion call (DIST-8).
- [x] `/apis` 403 → warning, `detectedDistribution: null`, test continues.
- [x] Results have 6 steps in order; a failure before the step reports `distribution` as skipped.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-23 backend-engineer: started.
- 2026-11-23 backend-engineer: `GetServedApiGroupsAsync` (GET /apis) + step 4 `Distribution` (enum value 5, ordered between
  identity and openShiftVersion); DIST-8 skip without the ClusterVersion call. Outside `paths`: `KubernetesDtos.cs`
  (APIGroupList DTO), `Fakes/FakeKubeApiServer.cs` (`MapApiGroups`), `TokenLeakSweepTests.cs` (/apis echoes the token).
  check-be green 333/705/789.

## Review
**Round 1 — backend-architect, 2026-11-23: APPROVE.** check-be green (333/705/789). Contract C (distribution parts)
is met: the messages match word for word; `detectedDistribution` stays null when discovery is unreadable or the test
stops earlier (tests at `ConnectionTesterTests.cs:239,255`); declared Kubernetes without detected OpenShift skips
ClusterVersion without calling it; a mismatch warns with `failureKind: null` and never fails the step. Layering is
fine (`ConnectionTestTarget` keeps `ClusterConnection` free of presentation data). The leak sweep now echoes the
token on `/apis` too. Step names are stored as strings, so no migration is needed. `detectedDistribution` is a
positional parameter, so the OpenAPI schema marks it `required` and nullable, the same as `failedStep`.
The three files outside the task paths (`KubernetesDtos.cs`, `FakeKubeApiServer.cs`, `TokenLeakSweepTests.cs`) were
needed for the work. They were missing from the task's paths, which was my mistake, not the engineer's.
- Optional: add a check to `OpenApiDocumentTests` that `ConnectionTestResult.detectedDistribution` is
  `oneOf [null, $ref ClusterDistribution]` and listed in `required`, like `NullableEnumProperties_StayNullableAtTheReference`.

## Handover notes
- New step `distribution` (`ConnectionTestStep.Distribution = 5`, append-only value; the list order is in `StepOrder`).
- New result field `detectedDistribution: ClusterDistribution | null` (null when /apis is not readable). The FE must
  regenerate `schema.gen.ts`; step labels need a "Distribution" entry.
- `ConnectionTester.TargetOf(cluster)` replaces `ConnectionOf`; `RunAsync` takes a `ConnectionTestTarget` (connection +
  declared distribution).
- Messages are public constants on `ConnectionTester`. Mismatch warnings have `failureKind: null`. Discovery 403/404
  warns with the probe kind. Declared Kubernetes and OpenShift not detected (including unreadable discovery) → skipped.
- The stored `ConnectionTestSummary` is unchanged: no migration, and a mismatch never sets `failedStep`.
