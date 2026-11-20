---
id: T-0062
title: Proxy security suites — authorization matrix, token-leak sweep, revocation, TLS isolation, streaming, audit failures
status: todo
owner: qa-engineer
checkpoint: 2
depends_on: [T-0061]
paths: [tests/FleetConsole.Api.Tests/Integration/Proxy/, tests/FleetConsole.Api.Tests/Integration/Admin/TokenLeakSweepTests.cs, tests/FleetConsole.Api.Tests/Integration/SessionRevalidationTests.cs, tests/FleetConsole.Api.Tests/Integration/AuthEndpointsTests.cs, tests/FleetConsole.Api.Tests/Integration/ApiTestExtensions.cs]
review_rounds: 0
---

## Goal
Prove the CP1 D3/R4 carry-over gates for the proxy (SEC-4, SEC-5) and the cross-cutting behaviours T-0061 only
smoke-tests (PRX-3, PRX-7, PRX-8 timing, PAUD-3), so QG-1 is met. File bug tasks (next free T-number) for failures
instead of fixing product code.

## Scope
- In: new test classes under `Integration/Proxy/`; extend `TokenLeakSweepTests` (or a sibling `ProxyTokenLeakSweepTests`
  reusing its helpers). Folded CP1 nit (T-0016): move the duplicated `MeStatusAsync` helper of
  `SessionRevalidationTests`/`AuthEndpointsTests` into one shared test extension (create `ApiTestExtensions.cs` if no
  such file exists).
- Out: product code changes (bugs → tasks).

## Contract / design notes
Expected outcomes: `docs/specs/CP2-api-contract.md` §4 (codes + check order). Cases:
- **SEC-5 matrix** (`ProxyAuthorizationMatrixTests`, table-driven like `AdminAuthorizationMatrixTests`): GET and PUT
  `…/k8s/api/v1/namespaces/shop/configmaps/web` for anonymous (401/401), deactivated user (401 — harness revalidates on
  every request), no grant (404/404), admin without grant (404/404), disabled cluster (404/404), ReadOnly grant (200/403
  `ReadOnlyGrant`), read-only user + ReadWrite (200/403 `UserReadOnly`), ReadWrite (200/200), PUT without CSRF (403
  `Auth.CsrfHeaderMissing`). Plus an **enumeration test**: every `RouteEndpoint` whose pattern contains `/k8s/` is in the
  matrix's route list (pattern of `AnonymousSurfaceTests.ApiEndpoints`).
- **SEC-4 sweep**: one SA token with a recognisable value, used for allowed GET, allowed PUT, denied PUT (ReadOnly),
  upstream 500, TLS error (wrong CA), credential rejected (401), unreachable upstream, path rejected. Assert via
  `TokenLeakScanner.AssertAbsent` (token, base64 and base64url forms) over: every response body and header produced by
  FleetConsole (not upstream-echoed bodies — the fake must not echo), all audit entries, the DB dump, and
  `factory.Logs` at all levels.
- **PRX-3**: open session, grant revoked / user deactivated / cluster disabled via `TestData` → next GET 404 (or 401 for
  deactivation); open watch with `WatchTimeoutCap=2s` (variant) ends ≤ ~3 s, and the re-watch after revocation is 404.
- **PRX-7**: two fake servers / two CAs / two clusters: each works with its own CA; cluster A configured with B's CA
  → 502 `UpstreamTls`; change A's CA bundle via admin API → next request succeeds (pool rebuild); skip-TLS cluster works
  against a wrong-host cert while the other cluster still fails.
- **PRX-8**: event written by the fake reaches the client within 1 s (measure from `SendAsync`); stream not buffered
  (first event arrives before the stream ends). If TestServer buffers, run that test on a Kestrel-hosted variant and
  note it.
- **PAUD-3**: client disconnects mid-PUT (fake delays) → entry with status 0; unreachable upstream → 502 entry; audit
  write failure (variant with a throwing `IAuditTrail` decorator) → response unaffected, Error log EventId 2400.

## Context pack
- `tests/FleetConsole.Api.Tests/Integration/Admin/AdminAuthorizationMatrixTests.cs:L97-153` (assert helper, request table, fill).
- `tests/FleetConsole.Api.Tests/Integration/AnonymousSurfaceTests.cs:L61-74` (endpoint enumeration).
- `tests/FleetConsole.Api.Tests/Integration/Admin/TokenLeakSweepTests.cs:L31-133` + `Integration/TokenLeakScanner.cs:AssertAbsent/DumpDatabaseAsync`.
- `tests/FleetConsole.Api.Tests/Integration/TestData.cs` (`ProxyClusterAsync`, `DeactivateAsync`, `SetReadOnlyAsync`, `GrantAsync`), `ApiFactory.cs:L105` (`CreateVariantAsync`), `L155` (`LoginAsAsync`); harness notes `docs/tasks/T-0015-api-login-session-endpoints.md` §Handover notes (L357-372).
- Fake: `tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs` (`MapWatch`, `Delay`, `RecordedRequest.Headers` from T-0057).

## Acceptance criteria
- [ ] SEC-5 matrix + enumeration test green.
- [ ] SEC-4 sweep green for all eight request kinds.
- [ ] PRX-3, PRX-7, PRX-8, PAUD-3 tests green (or bug tasks filed and linked here).
- [ ] `MeStatusAsync` exists once.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
