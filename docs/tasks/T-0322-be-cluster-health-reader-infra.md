---
id: T-0322
title: Fleet adapter — Infrastructure ClusterHealthReader over the forwarding pool (Table reads, 4 MiB cap, failure classification)
status: todo
owner: backend-engineer
checkpoint: 5c
depends_on: [T-0320]
paths: [src/FleetConsole.Infrastructure/Kubernetes/Health/, src/FleetConsole.Infrastructure/Kubernetes/ClusterProbeSession.cs, src/FleetConsole.Infrastructure/Kubernetes/ProbeFailureClassifier.cs, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs, tests/FleetConsole.Api.Tests/Kubernetes/ClusterHealthReaderTests.cs]
review_rounds: 0
---

## Goal
Implement `IClusterHealthReader` (T-0320 port; ADR-0041 §2, contract §3): read a cluster's health with the given token
through the proxy's pooled invoker, as cheaply as possible (server-side Tables), and reduce the answers to counts and
classified failures. Nothing raw (body, message, header) leaves the adapter.

## Scope
- In: `ClusterHealthReader` + JSON/Table parsing, a shared failure classifier, DI, `FakeKubeApiServer` helpers, tests.
- Out: caching/timeouts/policies (T-0320 probe), streaming (T-0321).

## Contract / design notes
- Invoker: `IClusterForwardingClients.TryGetInvoker(clusterId, connection, out invoker)`; `false` → every probe
  `ProbeResponse.Fail(ProbeFailureKind.InvalidResponse)` (upstreamError) — log Warning once. Request URI = API URL +
  raw path from `FleetProbePaths` (T-0320). Headers: `Authorization: Bearer` from `SensitiveString` (never logged),
  `Accept` per contract §3 (Table = `application/json;as=Table;v=v1;g=meta.k8s.io`). Probes of one cluster run
  concurrently (`Task.WhenAll`); each disposes its response.
- Body: read with a hard cap of 4 MiB (stream through a bounded read, not `ReadAsStringAsync`) → over cap =
  `InvalidResponse`. Parse with `JsonDocument`/`Utf8JsonReader` — no model classes for full objects.
- Status mapping: 200 → parse; 401 → `Unauthorized`; 403 → section `Forbidden`; 404 → section `NotFound`;
  other → `UnexpectedStatus`; non-JSON / wrong `kind` (`Table`, `ClusterVersion`) / missing column → `InvalidResponse`.
- Network/TLS mapping: **extract** the existing classification in `ClusterProbeSession` (HttpRequestException/
  SocketException/AuthenticationException → `ProbeFailureKind`) into `internal static ProbeFailureClassifier`
  and use it from both — behaviour of the connection test must not change (its tests stay green, untouched).
  `OperationCanceledException` is rethrown (the probe's budget decides timeout vs abort).
- Table parsing: column index by `columnDefinitions[].name` (case-insensitive); nodes `Status` cell: first comma item
  `Ready` → ready; any item `SchedulingDisabled` → unschedulable. Clusteroperators: `Available != "True"` → unavailable,
  `Degraded == "True"`, `Progressing == "True"`. ClusterVersion JSON: rules in contract §2 (`currentVersion` = newest
  `history[]` with `state == "Completed"`, else `desired.version`; conditions by `type`; `availableUpdates` length).
- One `LoggerMessage` Debug per failed probe (cluster id, probe name, kind) — no URL query, no body, no token.

## Context pack
- Docs: ADR-0041 §2; contract `docs/specs/CP5-api-contract.md` §2–§3; `BACKEND.md` §The proxy (pool, TLS trust).
- Exemplar: `src/FleetConsole.Infrastructure/Kubernetes/ClusterProbeSession.cs` (`SendAsync` request building, 4 MiB
  cap `MaxResponseBytes` L28, exception classification + `FindInner<T>` L309, `LoggerMessage` L331).
- Touch points: `Infrastructure/Proxy/ClusterForwardingClientPool.cs:TryGetInvoker` (L67);
  `Infrastructure/DependencyInjection.cs:L129-140` (register `IClusterHealthReader` singleton next to the pool);
  `Application/Abstractions/Kubernetes/ProbeFailureKind` / `ProbeResponse` (existing types, reuse).
- Test fake: `tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs` — add `MapNodesTable(params (string Status)[])`,
  `MapClusterOperatorsTable(params (string Available, string Progressing, string Degraded)[])` next to
  `MapClusterVersion` (L267; extend it with `failing`/`history`/`availableUpdates` optional args without breaking
  callers); `Respond` (L235) for 401/403/404/500; `Delay` (L223). Tests resolve the reader from `ApiFactory` services
  (no Infrastructure test project) — see `tests/FleetConsole.Api.Tests/Kubernetes/` for the pattern.

## Acceptance criteria
- [ ] OpenShift: CV + CO Table + nodes Table parsed into the expected counts/versions (incl. updating, failing,
      SchedulingDisabled, NotReady, Unknown); requests carry the Table `Accept` + `includeObject=None` + bearer token.
- [ ] Kubernetes: only `/version` + nodes requested (recorded requests asserted); no CV/CO calls.
- [ ] 401 → Unauthorized; 403/404 per section; 500 → UnexpectedStatus; HTML 200, missing column, > 4 MiB → InvalidResponse;
      closed port → ConnectionRefused; self-signed cert without CA → Tls*.
- [ ] Classifier extracted; existing connection-test tests unchanged and green.
- [ ] Caller cancellation propagates as OCE; XML docs; `scripts/check-be.sh` green.

## Work log

## Review

## Handover notes
