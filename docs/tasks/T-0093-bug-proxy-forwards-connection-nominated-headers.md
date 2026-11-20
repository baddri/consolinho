---
id: T-0093
title: "label: bug — proxy forwards request headers the client nominated as hop-by-hop in Connection"
status: done
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
- [x] Headers named in the client's `Connection` header are not forwarded; WebSocket upgrade forwarding (exec) still works.
- [x] `Connection_Nominated_Header_Is_Not_Forwarded_Over_Sockets` un-skipped and green.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 backend-engineer: `TransformRequestAsync` now also strips headers named in the client's `Connection`
  (comma-split, case-insensitive; `Upgrade` exempt) from request and content headers. Class XML remarks updated.
  QA test un-skipped; exec WebSocket test green. `scripts/check-be.sh` green (Api.Tests 711 passed, 0 skipped).

## Review
- 2026-11-20 backend-architect: **APPROVE**. check-be: 325/684 passed; Api 710/711. The one failure was
  `DevOAuthConfigurationTests.InvalidConfiguration_FailsAtStartup(ClientId "")`, which is unrelated to this diff
  (no DevOAuth changes) and passed 3/3 when rerun alone, so it looks flaky. The orchestrator should track it as a QA follow-up.
  Checked:
  - Parsing: handles every `Connection` value, comma lists, whitespace and case.
  - Order: the bearer is set after `Strip`, so nominating `Authorization` can't remove it. Nominating can only remove
    more headers, so the `Impersonate-*`/`X-Remote-*` strip still applies.
  - Framing: `Host`/`Transfer-Encoding` are never on `proxyRequest`. A nominated `Content-Length` makes HttpClient
    chunk the body (still correct; the body limit is enforced on the incoming side).
  - `Upgrade`: the exemption only matters for upgrade requests (YARP drops `Upgrade` otherwise).
  Optional:
  - `ProxyKestrelTests.cs:143` — extend to `Connection: keep-alive, X-Qa-Hop , Authorization` and assert that
    `Authorization` is still `Bearer fake-test-token.…`, to pin the strip-before-inject order and comma parsing.

## Handover notes
Fix in `KubernetesRequestTransformer.ConnectionNominated` + `Strip(headers, nominated)`. Only `Upgrade` is exempted;
any other nominated name (even e.g. `Content-Type`) is dropped per RFC 9110 §7.6.1. No new tests beyond the QA one.
