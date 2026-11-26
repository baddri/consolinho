---
id: T-0410
title: Verify long streams survive a cluster edit (pool retirement) + log retired-handler disposal
status: todo
owner: backend-engineer
checkpoint: 6a
depends_on: []
paths: [src/FleetConsole.Infrastructure/Kubernetes/ClusterForwardingClientPool.cs, tests/FleetConsole.Api.Tests/Integration/Proxy]
review_rounds: 0
size: S (0.5 d)
---

## Goal
Spec FP-1..3 asks that open watches/log follows survive a cluster edit. ADR-0036 already keeps a retired handler for
the longest stream lifetime + 1 min (61 min default) and unit tests cover it; FP-2's reference counting is therefore
not needed. This task proves it end to end and makes retirement observable.

## Contract / design notes
- No behaviour change in the pool unless the test fails (then stop and report to the architect).
- Add one Information log on retired-handler disposal: `Retired forwarding client for cluster {ClusterId} disposed after {Age}` (no URL, no token) and one on retirement.
- Endpoint test: open a log follow (`ProxyLogStreamTests` pattern) through `FakeKubeApiServer`, edit the cluster
  (CA/URL-unchanged edit that bumps the connection version), assert the stream keeps delivering lines and a new request
  uses a new handler (new connection on the fake).

## Context pack
- `src/FleetConsole.Infrastructure/Kubernetes/ClusterForwardingClientPool.cs` (retirement timer), ADR-0036.
- Tests: `tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyLogStreamTests.cs`, `Fakes/FakeKubeApiServer.cs`, existing pool unit tests (`grep -rln ClusterForwardingClientPool tests`).

## Acceptance criteria
- [ ] FP-1: stream open across a cluster edit keeps flowing (test); FP-3: new requests use the new connection settings.
- [ ] FP-2: documented as satisfied by ADR-0036 in this task's Work log (no ref counting).
- [ ] Retire/dispose log lines present and leak-free; build + tests green.

## Work log

## Review

## Handover notes
