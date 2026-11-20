---
id: T-0093
title: "label: bug — proxy forwards request headers the client nominated as hop-by-hop in Connection"
status: todo
owner: backend-engineer
checkpoint: 2
depends_on: []
paths: [src/FleetConsole.Api/Proxy/KubernetesRequestTransformer.cs, tests/FleetConsole.Api.Tests/Integration/Proxy/ProxyKestrelTests.cs]
review_rounds: 0
---

## Goal
SEC-1 requires that no hop-by-hop request header reaches the cluster. The fixed set (`Keep-Alive`, `Proxy-Connection`,
…) is stripped, but a header the client names in `Connection` (RFC 9110 §7.6.1, e.g. `Connection: X-Foo` + `X-Foo: 1`)
is forwarded to the API server. Found in CP2 VERIFY. Severity: low. Any custom header is forwarded anyway, so this
does not expose credentials. It is a literal SEC-1/RFC miss, and it lets a client smuggle hop-scoped headers upstream.

## Repro
Remove `Skip` from `ProxyKestrelTests.Connection_Nominated_Header_Is_Not_Forwarded_Over_Sockets` and run
`dotnet test tests/FleetConsole.Api.Tests --filter FullyQualifiedName~Connection_Nominated`. Expected: the fake API
server gets no `X-Qa-Hop`. Actual: it gets `X-Qa-Hop: sec1-hop` (over TestServer too). `Keep-Alive` is stripped.

## Suspected location
`KubernetesRequestTransformer.TransformRequestAsync`. YARP's default copy drops only its static hop-by-hop list. Read
the incoming `Connection` tokens and remove those headers from `proxyRequest`. Exempt `Upgrade`, which the WebSocket
exec path needs.

## Acceptance criteria
- [ ] Headers named in the client's `Connection` header are not forwarded; WebSocket upgrade forwarding (exec) still works.
- [ ] `Connection_Nominated_Header_Is_Not_Forwarded_Over_Sockets` un-skipped and green.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
