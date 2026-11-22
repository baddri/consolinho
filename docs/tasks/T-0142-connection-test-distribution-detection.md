---
id: T-0142
title: Connection test detects the distribution from API discovery — distribution step, mismatch warning, ClusterVersion skip
status: todo
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
- [ ] Declared OpenShift + `config.openshift.io` served → `distribution` passed, `detectedDistribution: "openShift"`.
- [ ] Declared Kubernetes + served → warning with the exact DIST-7 text; ClusterVersion runs as today; test succeeds.
- [ ] Declared OpenShift + not served → reverse warning; ClusterVersion as today (warning if not visible).
- [ ] Declared Kubernetes + not served → passed; `openShiftVersion` skipped "Not an OpenShift cluster", no ClusterVersion call (DIST-8).
- [ ] `/apis` 403 → warning, `detectedDistribution: null`, test continues.
- [ ] Results have 6 steps in order; a failure before the step reports `distribution` as skipped.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
