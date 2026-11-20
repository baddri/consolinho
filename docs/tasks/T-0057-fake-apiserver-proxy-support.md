---
id: T-0057
title: Fake kube-apiserver and test data for proxy tests (prefix routes, headers, streaming, per-cluster CA)
status: todo
owner: backend-engineer
checkpoint: 2
depends_on: []
paths: [tests/FleetConsole.Api.Tests/Fakes/, tests/FleetConsole.Api.Tests/Integration/TestData.cs, tests/FleetConsole.Api.Tests/Kubernetes/FakeKubeApiServerTests.cs]
review_rounds: 0
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
- [ ] Prefix routes: exact beats prefix, longest prefix wins, unmatched → 404 `Status` (existing behaviour).
- [ ] `RecordedRequest.Headers` captures every header incl. duplicates; `RawTarget` keeps percent-encoding.
- [ ] Self-test: an `HttpClient` trusting the server's CA receives a watch event within 1 s of `SendAsync` while the response is still open; two servers in one test have different CAs (a client trusting A fails against B).
- [ ] `TestData.ProxyClusterAsync` seeds a usable cluster/credential/grant; existing probe/admin tests still pass.
- [ ] Build, lint and tests green (CLAUDE.md rule 4)

## Work log

## Review

## Handover notes
