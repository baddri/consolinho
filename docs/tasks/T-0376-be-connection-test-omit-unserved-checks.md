---
id: T-0376
title: Connection test omits capability checks whose API group the cluster doesn't serve
status: todo
owner: backend-engineer
checkpoint: 5.5
depends_on: []
paths: [src/FleetConsole.Application/Credentials/ConnectionTesting, tests/FleetConsole.Application.Tests/Credentials/ConnectionTesting, tests/FleetConsole.Api.Tests/Integration/Admin/ConnectionTests]
review_rounds: 0
---

## Goal
On a Kubernetes cluster the connection test lists "List cluster operators" (`config.openshift.io`) as denied, which is
noise. Omit every check whose API group is not served, using the discovery the test already reads in the Distribution
step (DIST-7). Spec CP5.5 CT-1 (CP3.7 ACCEPT item). Headline rules (ADR-0011) unchanged.

## Scope
- In: filtering in `CapabilityCheckSet`, used by `ConnectionTester`; no review sent for omitted checks; tests; DTO doc text.
- Out: SPA (T-0378, CT-2/CT-3); new checks; changing the headline rules.

## Contract / design notes
- Schema unchanged (spec §4.4). Only update the XML doc of `CapabilitySummaryDto.Checks`: "Every evaluated check in a
  stable order; checks whose API group the cluster does not serve are omitted (CT-1). Render the list as received."
- Keep "one place" (ADR-0011): add to `CapabilityCheckSet`
  ```csharp
  /// Checks that apply to a cluster serving servedGroups; core ("") is always served; null = discovery not readable ⇒ all checks.
  public static IReadOnlyList<CapabilityCheck> ApplicableTo(IReadOnlyCollection<string>? servedGroups)
  ```
  Order preserved (subset of `Checks`). Rule: keep a check when `Attributes.Group` is `""`, or `servedGroups` is null,
  or `servedGroups` contains it.
- `ConnectionTester`: `TestRun` keeps the served group names from `CheckDistributionAsync` (`groups.Value.Names`; stays
  null when discovery is unreadable — then nothing is omitted, never guess). `CheckCapabilitiesAsync` uses
  `CapabilityCheckSet.ApplicableTo(run.ServedApiGroups)` instead of `Checks`; the cluster-admin review stays index 0;
  omitted checks get **no** `SelfSubjectAccessReview` call.
- Distribution is decided by **detection**, not declaration: a cluster declared Kubernetes that serves
  `config.openshift.io` keeps the check.
- Headline: `Evaluate` already treats a missing id as denied; `ViewChecks`/`EditChecks` are core/`apps` only, so they are
  never omitted. Pin that with a test (every headline id is in `ApplicableTo(["apps"])`), so a future check in an
  optional group can't silently lower headlines.
- `Credential.RecordTest`/stored summary: unchanged (summary holds headline + failed step only, CT-3 is FE-side).

## Context pack
- Docs: ADR-0011 (headline), ADR-0032 (distribution detection); `BACKEND.md` not affected.
- Touch points:
  - `src/FleetConsole.Application/Credentials/ConnectionTesting/CapabilityCheckSet.cs:Checks` (L30-44) / `Evaluate`
  - `src/FleetConsole.Application/Credentials/ConnectionTesting/ConnectionTester.cs:CheckDistributionAsync` (L286-313),
    `CheckCapabilitiesAsync` (L351-379), `TestRun` (L481, add `ServedApiGroups` next to `DetectedDistribution` L495)
  - `src/FleetConsole.Application/Credentials/ConnectionTesting/ConnectionTestResultDto.cs:CapabilitySummaryDto` (doc L61)
  - `src/FleetConsole.Application/Abstractions/Kubernetes/ProbeResults.cs:ServedApiGroups` (L19)
- Test exemplars:
  - `tests/FleetConsole.Application.Tests/Credentials/ConnectionTesting/ConnectionTesterTests.cs:Healthy_cluster_passes_all_steps_with_versions_identity_and_checks` (L31; OpenShift: full list unchanged)
  - same file `Kubernetes_declared_and_not_served_passes_and_skips_ClusterVersion_without_calling_it` (L208; copy for: Kubernetes ⇒ no `list-clusteroperators` row and no review for it in `_probes.ReviewedAttributes`), `KubernetesGroups` (L22)
  - `Kubernetes_declared_but_OpenShift_served_…` (L174; mismatch keeps the check), `Discovery_not_visible_…` (L227; all checks kept)
  - Fake: `tests/FleetConsole.Application.Tests/Credentials/ConnectionTesting/FakeProbeClient.cs`
  - Optional API assertion: extend `tests/FleetConsole.Api.Tests/Integration/Admin/ConnectionTests/ConnectionTestEndpointsTests.cs:TestCredential_OnKubernetesCluster_WithoutOpenShiftApis_SkipsClusterVersion` (L163) to assert no `list-clusteroperators` id.

## Acceptance criteria
- [ ] CT-1: Kubernetes (detected) ⇒ `capabilities.checks` has no `list-clusteroperators`, and no review is sent for it.
- [ ] OpenShift ⇒ list identical to `CapabilityCheckSet.Checks`; discovery unreadable ⇒ all checks.
- [ ] Headline unchanged in both distributions; guard test for headline ids.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
