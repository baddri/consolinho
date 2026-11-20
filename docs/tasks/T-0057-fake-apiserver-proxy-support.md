---
id: T-0057
title: Fake kube-apiserver and test data for proxy tests (prefix routes, headers, streaming, per-cluster CA)
status: done
owner: backend-engineer
checkpoint: 2
depends_on: []
paths: [tests/FleetConsole.Api.Tests/Fakes/, tests/FleetConsole.Api.Tests/Integration/TestData.cs, tests/FleetConsole.Api.Tests/Kubernetes/FakeKubeApiServerTests.cs]
review_rounds: 1
---

## Goal
Make `FakeKubeApiServer` able to stand in for a cluster behind the proxy (QG-1): record every header, answer by path
prefix, stream watch events on demand, and let tests seed clusters pointing at it with its CA. Closes the HANDOVER
CP2 follow-up "fake apiserver needs prefix routes + streaming bodies (T-0010)". Lane B — parallel with T-0056/T-0058.

## Scope
- In: fake server + `TestData` extensions + a small self-test. Keep all existing members working (probe tests use them).
- Out: proxy tests themselves (T-0061/T-0062).

## Contract / design notes
Additions to `FakeKubeApiServer` (names binding — T-0061/T-0062 use them):
```csharp
public sealed record RecordedRequest(string Method, string Path, string Query, string? Authorization, string Body,
    IReadOnlyDictionary<string, string[]> Headers /* all request headers, case-insensitive keys */,
    string RawTarget /* path+query exactly as received */);
public void MapPrefix(string method, string pathPrefix, RequestDelegate handler); // exact routes win; longest prefix next
public WatchStream MapWatch(string path);                // GET path?watch=… → 200, chunked, held open
public sealed class WatchStream {                         // one per mapped watch path
    public Task<int> Connected { get; }                    // completes when a client is attached; value = timeoutSeconds seen (0 if none)
    public Task SendAsync(string type, object @object, CancellationToken ct); // writes {"type":..,"object":..}\n and flushes
    public Task CloseAsync();                              // ends the response
}
public void RespondWithHeaders(string method, string path, int status, IDictionary<string,string> headers, object? body = null); // e.g. Set-Cookie, WWW-Authenticate
public void Delay(string method, string path, TimeSpan delay); // for timeout tests (honours RequestAborted)
public IReadOnlyCollection<RecordedRequest> Requests { get; }  // existing — keep
```
- `StartAsync` already creates a CA per instance; expose `CaBundlePem` (exists) and allow two servers in one test
  (two distinct CAs) — verify with a test.
- `TestData.ClusterAsync(..., string? caBundlePem = null, bool skipTlsVerify = false)` — passes through to
  `ApiServerEndpoint.Create`. Add `TestData.ProxyClusterAsync(FakeKubeApiServer server, string username, AccessMode mode,
  string? token = null)` → `(SeededCluster Cluster, SeededCredential Credential)` seeding cluster (server URL + CA),
  credential and grant in one call (most proxy tests need exactly this).
- Watch responses: `Content-Type: application/json`, no `Content-Length`, flush after each event (Kestrel
  `Response.Body.FlushAsync`); `SendAsync` before `Connected` waits for the client.

## Context pack
- `tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs:L33` `RecordedRequest`, `L94-124` `StartAsync`, `L130-147` `Map`/`Respond`, `L225-247` `HandleAsync` (routing to extend), `L266-281` status/JSON helpers.
- `tests/FleetConsole.Api.Tests/Fakes/TestCertificateAuthority.cs:IssueServerCertificate`.
- `tests/FleetConsole.Api.Tests/Integration/TestData.cs:L91-123` `ClusterAsync`, `L124-175` `CredentialAsync`/`GrantAsync` (compose `ProxyClusterAsync` from these).
- Usage exemplar: `tests/FleetConsole.Api.Tests/Kubernetes/ClusterProbeClientTests.cs:L26-50`.

## Acceptance criteria
- [x] Prefix routes: exact beats prefix, longest prefix wins, unmatched → 404 `Status` (existing behaviour).
- [x] `RecordedRequest.Headers` captures every header incl. duplicates; `RawTarget` keeps percent-encoding.
- [x] Self-test: an `HttpClient` trusting the server's CA receives a watch event within 1 s of `SendAsync` while the response is still open; two servers in one test have different CAs (a client trusting A fails against B).
- [x] `TestData.ProxyClusterAsync` seeds a usable cluster/credential/grant; existing probe/admin tests still pass.
- [x] Build, lint and tests green (CLAUDE.md rule 4)

## Work log
- 2026-11-20 backend-engineer: started; worktree was on `main`, fast-forwarded to `cp/2-proxy-browser`.
- 2026-11-20 backend-engineer: prefix routes, headers/RawTarget recording, `MapWatch`/`WatchStream` (own file
  `Fakes/WatchStream.cs`, top-level type), `RespondWithHeaders`, `Delay`; `TestData` CA/skip-TLS + `ProxyClusterAsync`;
  8 self-tests. `scripts/check-be.sh` green (620 Api tests, podman OK). Ready for review.
- 2026-11-20 backend-engineer: review round 1 — watch honours `timeoutSeconds` (+ self-test), documented
  `RespondWithHeaders` Content-Type override and first-connection `Connected`. check-be.sh green.

## Review
**Round 1 — backend-architect — CHANGES_REQUESTED** (check-be.sh green: 323/402/620; deviations accepted)
1. `tests/FleetConsole.Api.Tests/Fakes/WatchStream.cs:L89-L103` — the fake ignores `timeoutSeconds`; per ADR-0020 §5/§7 the
   proxy bounds watches only by capping `timeoutSeconds`, and kube-apiserver ends the watch then. T-0062 PRX-3 ("watch with
   `WatchTimeoutCap=2s` ends ≤ ~3 s") cannot prove that end-to-end without the test hand-calling `CloseAsync` — required
   fix: when `timeoutSeconds > 0`, end the held-open response after that many seconds (e.g. `linked.CancelAfter`), update
   the XML doc + Handover note, and add a self-test (`?watch=1&timeoutSeconds=1` → stream ends within ~2 s).
- Optional: `Connected` only completes for the first connection (documented); fine for T-0061/62, revisit if a reconnect test appears.
- Optional: `RespondWithHeaders` — a caller-supplied `Content-Type` is overwritten by `WriteJsonAsync`; mention in the XML doc.
- Verified OK: exact>longest-prefix>404 routing, `RawTarget` from `IHttpRequestFeature` keeps `%2F`, multi-line headers
  kept, watch flush-per-event with no Content-Length, `Delay` honours abort + dispose, two-CA test, disposal ends watches;
  timing asserts are generous upper bounds / lower-bound-only (no flakiness seen).
**Round 2 — backend-architect — APPROVE** (check-be.sh green: 323/402/621). Finding 1 fixed: `WatchStream.HoldOpenAsync`
`CancelAfter(timeoutSeconds)` after connect, XML doc + Handover updated, self-test asserts end ≤ 3 s and ≥ 0.5 s; Content-Type nit documented.

## Handover notes
- `WatchStream` is a top-level type in `FleetConsole.Api.Tests.Fakes` (not nested): use `var watch = server.MapWatch(path)`.
  A `GET path?watch=…` hits it before exact/prefix routes; non-watch GETs on the same path use normal routes. One client
  at a time (a reconnect replaces the target of `SendAsync`); after `CloseAsync` later connections end immediately.
  A positive `timeoutSeconds` ends the watch response after that many seconds (like kube-apiserver; PRX-3 relies on it).
  Dispose of the server ends open watches and pending `Delay`s (no 30 s graceful-stop wait).
- `Requests` stays `IReadOnlyList<RecordedRequest>` (contract said `IReadOnlyCollection`; list is a superset, kept for
  existing callers). `Headers` = one value per received header line; HttpClient folds repeats into one line, so the
  self-test uses raw HTTP/1.1 over `SslStream`.
- `RespondWithHeaders` always sends `application/json` (a `Content-Type` in `headers` is overwritten; use `Map`).
- `Delay` applies before routing (any route incl. 404/watch), exact path only.
- `ProxyClusterAsync` pre-creates the user (role User) if missing, so `factory.NewUsername()` works directly.
- CA1711/CA1720/CA1001 suppressed on `WatchStream` with justifications (binding names from the contract).
