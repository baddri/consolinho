---
id: T-0091
title: Forward WebSocket upgrades (exec/attach/port-forward) to clusters as HTTP/1.1 Upgrade, not HTTP/2 extended CONNECT
status: todo
owner: backend-engineer
checkpoint: 4
depends_on: [T-0062]
paths: [src/FleetConsole.Api/Proxy/, tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs, tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyKestrelTests.cs]
review_rounds: 0
---

## Goal
T-0062 found that YARP forwards a browser's HTTP/1.1 WebSocket upgrade to the fake API server as an HTTP/2 extended
CONNECT (RFC 8441), because `ForwarderRequestConfig` keeps YARP's default (HTTP/2, `RequestVersionOrLower`).
kube-apiserver's upgrade-aware handler for exec/attach/port-forward expects an HTTP/1.1 `Upgrade` it can hijack. So
CP4's exec terminal may fail against real clusters even though the tests pass. Pin upgrades to HTTP/1.1 and test that path.

## Scope
- In: `KubernetesProxyEndpoint` — for upgrade requests (`isUpgrade`), set `ForwarderRequestConfig.Version = HttpVersion.Version11`
  and `VersionPolicy = HttpVersionPolicy.RequestVersionExact`; comment why. Fake API server: a mode that disables HTTP/2
  (HTTP/1.1-only listener) so the test fails if an upgrade is sent as CONNECT. Update the exec test to require `GET` + 101.
- Out: exec UI (CP4 frontend), non-upgrade requests (HTTP/2 stays the default for them).

## Contract / design notes
- Audit: the `proxy.connect` entry's `statusCode` becomes the upstream 101 (today 200 from CONNECT). Entry is still
  written when the session ends (after `IHttpForwarder.SendAsync` returns) — document that in BACKEND.md proxy audit section.
- If a decision differs from the above (e.g. keep HTTP/2 with fallback), record it in ADR-0020 rather than here.

## Context pack
- `src/FleetConsole.Api/Proxy/KubernetesProxyEndpoint.cs:L88` (`isUpgrade`), `L129-134` (`ForwarderRequestConfig`).
- `tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyKestrelTests.cs:WebSocket_Exec_Is_Forwarded_With_The_SA_Token_And_Audited_As_Connect`
  (accepts both CONNECT/200 and GET/101 today — tighten to GET/101).
- `tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs:StartAsync` (Kestrel listen options; `UseWebSockets()` from T-0062).

## Acceptance criteria
- [ ] Exec over the Kestrel variant reaches an HTTP/1.1-only fake as `GET` + `Upgrade: websocket`, echo works, audit `statusCode` 101.
- [ ] Non-upgrade proxy tests unchanged and green.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
