---
id: T-0010
title: Kubernetes probe client with categorized TLS/network failures, and the fake kube-apiserver test harness
status: done
owner: backend-engineer
checkpoint: 1
depends_on: []
paths: [src/FleetConsole.Application/Abstractions/Kubernetes/, src/FleetConsole.Application/Abstractions/SensitiveString.cs, src/FleetConsole.Infrastructure/Kubernetes/, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Api.Tests/Kubernetes/, tests/FleetConsole.Api.Tests/Fakes/, tests/FleetConsole.Application.Tests/Abstractions/]
review_rounds: 1
---

## Goal
Build the low-level port and adapter that talk to a managed cluster's API server with a given token and TLS settings,
returning **categorized** failures the connection test (T-0020) turns into plain-language steps. Also build the fake
kube-apiserver harness that QG-2 (and CP2's proxy tests) use. No Domain dependency, so it starts immediately.
**Parallel group W1** (with T-0007, T-0009).

## Scope
- In: `SensitiveString`; `IClusterProbeClient` port + records; `ClusterTlsHandlerFactory`; `ClusterProbeClient`;
  DI registration; `FakeKubeApiServer` harness with real TLS; tests.
- Out: step orchestration, capability check set, endpoints (T-0020).

## Contract / design notes
Read ADR-0011. Kubernetes JSON shapes: `authorization.k8s.io/v1` SelfSubjectAccessReview / SelfSubjectRulesReview,
`authentication.k8s.io/v1` SelfSubjectReview, `config.openshift.io/v1` ClusterVersion (`status.desired.version`,
`status.conditions[type=Progressing].status`).

```csharp
// Application/Abstractions/SensitiveString.cs
/// Wraps secrets (SA tokens) inside the Application layer; ToString() returns "[redacted]" (ADR-0013 §11).
public sealed class SensitiveString { public SensitiveString(string value); public string Reveal(); public override string ToString(); }

// Application/Abstractions/Kubernetes/
public sealed record ClusterConnection(Uri ApiUrl, string? CaBundlePem, bool SkipTlsVerify);
public enum ProbeFailureKind { DnsFailure, ConnectionRefused, Timeout, TlsUnknownAuthority, TlsHostnameMismatch,
    TlsCertificateExpired, TlsOther, Unauthorized, Forbidden, NotFound, UnexpectedStatus, InvalidResponse }
public sealed record ProbeFailure(ProbeFailureKind Kind, string Message);      // Message: user-safe, no token, no body dump
public sealed record ProbeResponse<T>(T? Value, ProbeFailure? Failure) { bool IsSuccess; static Ok(T); static Fail(ProbeFailure); }
public sealed record KubernetesVersionInfo(string GitVersion);
public sealed record SelfSubjectReviewInfo(string Username, IReadOnlyList<string> Groups);
public sealed record ClusterVersionInfo(string Version, bool UpdateProgressing);
public sealed record ResourceAttributes(string Verb, string Group, string Resource, string? Subresource = null, string? Namespace = null);
public sealed record AccessReviewResult(bool Allowed, string? Reason);
public sealed record ResourceRule(IReadOnlyList<string> Verbs, IReadOnlyList<string> ApiGroups, IReadOnlyList<string> Resources, IReadOnlyList<string> ResourceNames);
public sealed record RulesReviewResult(bool Incomplete, string? EvaluationError, IReadOnlyList<ResourceRule> Rules);

public interface IClusterProbeClient
{
    /// Opens a probe session (one TLS handler) for a single test run; dispose it at the end.
    IClusterProbeSession Open(ClusterConnection connection, SensitiveString token);
}
public interface IClusterProbeSession : IAsyncDisposable
{
    Task<ProbeResponse<KubernetesVersionInfo>> GetVersionAsync(CancellationToken ct);              // GET /version
    Task<ProbeResponse<SelfSubjectReviewInfo>> GetSelfSubjectReviewAsync(CancellationToken ct);    // POST .../selfsubjectreviews
    Task<ProbeResponse<ClusterVersionInfo>> GetClusterVersionAsync(CancellationToken ct);          // GET .../clusterversions/version
    Task<ProbeResponse<AccessReviewResult>> ReviewAccessAsync(ResourceAttributes attributes, CancellationToken ct);
    Task<ProbeResponse<RulesReviewResult>> ReviewRulesAsync(string @namespace, CancellationToken ct);
}
```
Infrastructure:
- `Kubernetes/ClusterTlsHandlerFactory` — creates a `SocketsHttpHandler` for a `ClusterConnection`: CA bundle →
  `X509ChainPolicy { TrustMode = CustomRootTrust, CustomTrustStore = <bundle> }`; `SkipTlsVerify` → accept any cert;
  otherwise system trust. The validation callback records `SslPolicyErrors` + chain status flags into a per-handler
  `TlsValidationRecord` so a failed handshake can be classified (`UntrustedRoot`/`PartialChain` → unknown authority,
  `NotTimeValid` → expired, `RemoteCertificateNameMismatch` → hostname mismatch). Documented as the factory CP2's pool reuses.
- `Kubernetes/ClusterProbeClient` — `Bearer` header per request; JSON via `System.Text.Json` with small internal DTOs;
  status mapping 401 → Unauthorized, 403 → Forbidden, 404 → NotFound, other non-2xx → UnexpectedStatus;
  `HttpRequestException` with `SocketError.HostNotFound`/`TryAgain` → DnsFailure, `ConnectionRefused` → ConnectionRefused,
  `AuthenticationException` → TLS kind from the record; `OperationCanceledException` not from the caller token → Timeout.
  Never log the token or response bodies.
- Register `IClusterProbeClient` as singleton in `AddInfrastructure`.

Test harness `tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer`: Kestrel on `127.0.0.1:0`, TLS with an in-test
generated CA + server cert (`CertificateRequest`; SAN `localhost`/`127.0.0.1`; options for expired / wrong-host certs),
a route table the test configures (`MapGet("/version", ...)`, scripted SSAR answers keyed by verb/resource), records
received requests (path, method, `Authorization` header) for assertions. XML-documented: CP2 reuses it.

## Acceptance criteria
- [x] Tests against the fake server cover: OK `/version`; 401; 403; 404; CA-bundle trust OK; unknown authority (no
      bundle, self-signed); hostname mismatch; expired cert; skip-TLS accepts; connection refused (closed port); DNS
      failure (`*.invalid` host); timeout (server delays beyond token); SSAR/SSRR/ClusterVersion/SelfSubjectReview JSON
      parsing; the token is sent as `Bearer` and appears in no log output (QG-2 groundwork).
- [x] `SensitiveString.ToString()` and a record containing it never print the value (unit test).
- [x] XML docs; layering intact. Build, lint and tests green (CLAUDE.md rule 4).

## Work log
- 2026-11-18 backend-engineer: started (status in_progress). Read CLAUDE.md, BACKEND.md, SECURITY.md, ADR-0011, ADR-0004, ADR-0013 §11.
- 2026-11-18 backend-engineer: implemented port + records (`Application/Abstractions/Kubernetes/`), `SensitiveString`,
  `ClusterTlsHandlerFactory`/`ClusterTlsHandler`/`TlsValidationRecord`, `ClusterProbeClient`/`ClusterProbeSession`
  (+ internal JSON DTOs), DI registration, `FakeKubeApiServer` + `TestCertificateAuthority`, tests. No NuGet changes.
  Deviations from the contract sketch (all minor, documented in Handover notes): `ReviewRulesAsync` parameter is
  `namespaceName` (CA1716 rejects `@namespace` on interface members); `ProbeResponse<T>` is a non-positional record
  with a private constructor so "value xor failure" can't be violated. Outside `paths`: one line in
  `tests/FleetConsole.Application.Tests/ServiceProviderBuilder.cs` — the new test namespace
  `FleetConsole.Application.Tests.Abstractions` shadowed its relative `Abstractions.Messaging.*` references, now fully
  qualified (`Application.Abstractions.Messaging.*`). Build `-warnaserror` and full `dotnet test` green (status in_review).
- 2026-11-19 backend-engineer: review round 1 fixes. (Required) `ClusterProbeClient.Open` throws `ArgumentException`
  unless `ApiUrl` is an absolute `https` URL; tests `HttpApiUrl_IsRejected_AndNoRequestReachesTheListener` (plain TCP
  listener sees no pending connection; fake server records no request) and `RelativeApiUrl_IsRejected`. (a) Skip-TLS
  handlers no longer record tolerated rejections, so any TLS failure in that mode is `TlsOther`; test
  `SkipTlsVerify_DoesNotRecordToleratedCertificateProblems`. (b) Softened the CA-bundle wording (factory remarks +
  handover); intermediate-only bundles remain unverified. Also documented on `TlsValidationRecord` that CP2's pooled
  handlers need a fresh record per connection attempt. Verified in a clean worktree at `947df13` + T-0010 files
  (working tree has T-0008/T-0011 WIP that breaks build/tests): build `-warnaserror` OK; tests Domain 153, Application
  43, Api 142 passed. Status in_review.

## Review
**Round 1 — 2026-11-19 backend-architect: CHANGES_REQUESTED** (one small security fix; everything else is approved)

How I checked: the working tree has T-0008's in-progress Domain files, which don't compile yet (`ClusterName.cs` CS0103).
So I built a clean worktree at `947df13` with only the T-0010 changes applied:
`dotnet build FleetConsole.slnx -warnaserror` passed with 0 warnings. `dotnet test FleetConsole.slnx` passed: Domain 153,
Application 43, Api 139. I also ran scratch tests, then deleted them. A response body over 4 MiB maps to `InvalidResponse`,
both with Content-Length and chunked. An `http://` ApiUrl is accepted and the request is sent (see finding 1).

Findings (required):
1. `src/FleetConsole.Infrastructure/Kubernetes/ClusterProbeClient.cs:30-33` — `Open` does not enforce that
   `ClusterConnection.ApiUrl` is an absolute `https` URL, even though the record's docs say it must be. With
   `http://…` the session sends `Authorization: Bearer <token>` in cleartext (I confirmed the request is sent). The
   Domain `apiUrl` rule (T-0008) prevents this today. But this adapter is the place where the token is revealed. It is
   also the reference for CP2's pool, so it has to enforce this rule itself and not rely on its callers. A relative
   URI also crashes later in `WithTrailingSlash` with an unhelpful `InvalidOperationException`. **Fix:** in `Open`,
   throw `ArgumentException` (programming error, not a probe failure) when `!ApiUrl.IsAbsoluteUri ||
   ApiUrl.Scheme != Uri.UriSchemeHttps`. Add a test that also asserts the fake server, or any listener, received no
   request.

Rulings on the deviations:
- `namespaceName` instead of `@namespace`: **accepted**. CA1716 is right. T-0020 calls it positionally.
- `ProbeResponse<T>` as a non-positional record with a private constructor and a scoped CA1000 suppression:
  **accepted**. It enforces "value xor failure". `with` can't break it because the properties are get-only.
  `[MemberNotNullWhen]` gives callers nullability flow. The `Ok/Fail` call sites match the contract.
- Unreachable/reset/proxy errors mapped to `ConnectionRefused` with a distinct "could not connect" message:
  **accepted**. The kind set is fixed by ADR-0011, and the admin's action is the same (check the URL and the network
  path). If a finer kind is ever needed, add it to ADR-0011 first.
- 4 MiB response cap: **accepted**. Real answers, including a cluster-admin SSRR, are far below it. Exceeding it is
  `InvalidResponse` (verified above). It protects the console from a hostile or misconfigured endpoint.
- Local `RecordingLogger<T>` instead of `CapturedLogs`/`TokenLeakScanner`: **accepted** for this task, because those
  helpers don't exist yet and this test sits on the adapter, not on HTTP. T-0020's endpoint tests must use the shared
  scanner once it lands. That is already recorded in the follow-ups.

Security review (passed apart from finding 1):
- Token: `Reveal()` is used only for the per-request header. Log messages are source-generated (method, path, host,
  kind). Logged exceptions are transport, TLS or JSON errors that contain no headers or bodies. Failure messages
  include only the host and status. Redirects and cookies are off, so the token can't follow a redirect. The test
  covers 401, an echoing server, an untrusted handshake and a timeout. `SensitiveString` covers `ToString`,
  interpolation, record printing, JSON and the debugger.
- TLS: each handler gets its own `SslClientAuthenticationOptions` with `CertificateChainPolicy` set to
  `CustomRootTrust`, `NoCheck` revocation, and a callback that captures only its own record. There is no
  `ServicePointManager` and no global callback. A CA bundle replaces system trust, as kubeconfig does. Hostname
  checking stays on when a bundle is used (tested).
- SkipTlsVerify is explicit. It takes precedence over the bundle, the bundle is not parsed, and the callback accepts
  but still records. Valid, expired and wrong-host certificates are tested.

Other areas (passed): failure categorization and priority, and timeout semantics (only the adapter's
`HttpClient.Timeout`, plus the connect timeout, becomes `Timeout`; caller OCE propagates; the T-0020 note is correct).
Handler ownership: `ClusterTlsHandler` owns the handler and certs, and `disposeHandler: false` is documented. DI uses
singletons. The fake server is solid for T-0020: real TLS, three cert variants, recorded requests, and SSAR scripting
keyed by attributes.

Optional / follow-ups (not blocking):
- `TlsValidationRecord.cs:13-15` — "successful validations never clear an earlier rejection" is fine for a
  short-lived probe session. In CP2's long-lived pooled handler, though, an old rejection would misclassify an
  unrelated later TLS failure. CP2's pool should create a fresh record per connection attempt or clear it on success.
  I added this to the follow-ups below.
- `ClusterProbeSession.cs:258-269` — with `SkipTlsVerify` the callback records every rejection it tolerates. A later
  handshake failure for another reason (protocol mismatch) would then be classified as, for example,
  `TlsUnknownAuthority`. Consider classifying as `TlsOther` when skip is on.
- The handover says "all bundle certs are trust anchors" for `CustomTrustStore`. That is unverified: on Linux,
  .NET may treat certs in the bundle that are not self-signed as intermediates. Either soften the wording or add an
  intermediate-only test.
- `FakeKubeApiServer` routes only on exact method + path. CP2 proxy tests will need prefix or wildcard routes and
  query-aware matching. `HandleAsync` also buffers the whole request body before dispatch, which would block
  streaming-upload tests. Extend it in CP2; there is no need now.

**Round 2 — 2026-11-19 backend-architect: APPROVE**

How I checked: I used a clean worktree at `947df13` with only the T-0010 files, because the shared tree has T-0008 and
T-0011 in progress. Before copying, I confirmed that `Infrastructure/DependencyInjection.cs` and
`Application.Tests/ServiceProviderBuilder.cs` contain only T-0010 changes. `dotnet build FleetConsole.slnx
-warnaserror` passed with 0 warnings. `dotnet test FleetConsole.slnx` passed: Domain 153, Application 43, Api 142 (+3).
I removed the worktree afterwards.

- Finding 1 (http/relative ApiUrl) is **resolved**. `ClusterProbeClient.cs:36-42` throws `ArgumentException`
  before the handler is built and before the token is revealed. The comment explains why it throws instead of
  returning a probe failure. The tests check both a raw TCP listener (no pending connection) and the fake server (no
  recorded request), and a relative URL is rejected.
- Optional skip-TLS misclassification is **resolved**. `ClusterTlsHandlerFactory.cs:61-66` accepts tolerated
  certificates without recording them, so `Classify()` returns null and the session maps to `TlsOther`. The factory
  remarks and `TlsValidationRecord.Record` docs were updated to match. The test asserts the record stays empty after a
  skip-mode request to an expired certificate.
- The docs on intermediate-only bundles and the CP2 pooled record are **resolved**. They now say what is tested and
  what isn't, and the CP2 requirement is stated on `TlsValidationRecord` and in the follow-ups.
- No new issues. The FakeKubeApiServer routing note for CP2 stays an open, non-blocking follow-up.

## Handover notes
**Done**
- Port: `src/FleetConsole.Application/Abstractions/Kubernetes/` (`IClusterProbeClient`, `IClusterProbeSession`,
  `ClusterConnection`, `ProbeFailureKind`, `ProbeFailure`, `ProbeResponse<T>`, result records in `ProbeResults.cs`) and
  `Application/Abstractions/SensitiveString.cs` (`ToString()` → `[redacted]`, no public properties so JSON writes `{}`,
  `[DebuggerDisplay]` redacted).
- Adapter: `src/FleetConsole.Infrastructure/Kubernetes/`. `ClusterTlsHandlerFactory.Create(ClusterConnection)` returns a
  `ClusterTlsHandler` (owns `SocketsHttpHandler` + parsed CA certs + `TlsValidationRecord`) — **CP2's pool should reuse
  this** and wrap `Handler` in an `HttpMessageInvoker` with `disposeHandler: false`. CA bundle → `CustomRootTrust` with
  the bundle as the trust store, revocation `NoCheck`; skip-TLS accepts and records nothing (failures in that mode → `TlsOther`); `Open` rejects non-https API URLs
  with `ArgumentException`; redirects off, cookies off,
  `ConnectTimeout` 10 s. Unparsable bundle → `InvalidCaBundleException` → the probe session fails every call with
  `TlsOther` (no exception to the caller).
- `ClusterProbeClient` (singleton) per-request timeout `DefaultRequestTimeout` = 10 s (HttpClient.Timeout), response
  buffer cap 4 MiB. Failures are logged once at Information (`EventId 3100`: method, path, host, kind, exception) —
  never token/body/headers.
- TLS classification priority: UntrustedRoot/PartialChain → `TlsUnknownAuthority`, then NotTimeValid →
  `TlsCertificateExpired`, then name mismatch → `TlsHostnameMismatch`, else `TlsOther`.
- Network mapping: name resolution → `DnsFailure`; `ConnectionRefused` socket error → `ConnectionRefused`; other
  connection errors (unreachable, reset, proxy) also → `ConnectionRefused` with a generic "could not connect" message
  (no finer kind in the contract); `SocketError.TimedOut` → `Timeout`; malformed/non-JSON/oversized/missing required
  field → `InvalidResponse`.
- Tests: `tests/FleetConsole.Api.Tests/Kubernetes/ClusterProbeClientTests.cs` (30 cases incl. theories, no container
  needed, ~2 s), `ProbeClientRegistrationTests.cs`, `RecordingLogger<T>`; `tests/FleetConsole.Application.Tests/
  Abstractions/{SensitiveStringTests,ProbeResponseTests}.cs`.
- Harness: `tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer.cs` (+ `TestCertificateAuthority.cs`):
  `StartAsync(FakeServerCertificate.Valid|Expired|WrongHost)`, `BaseAddress` (`https://127.0.0.1:{port}/`),
  `CaBundlePem`, `Map/MapGet/Respond`, `MapVersion`, `MapSelfSubjectReview`, `MapClusterVersion`, `SetAccessReview`
  (unscripted SSARs are denied), `MapRulesReview`, `Requests` (method, path, query, Authorization, body). Unmatched
  routes → Kubernetes `Status` 404.

**Notes for T-0020 (connection tester)**
- Caller cancellation **propagates** as `OperationCanceledException`; only the adapter's own per-request timeout becomes
  `ProbeFailureKind.Timeout`. The tester's 15 s budget CTS must therefore catch OCE when its budget (not the request
  token) fired and map it to a `Timeout` step failure itself.
- `ProbeFailure.Message` is already user-safe (host + status only) and can be shown as-is or replaced by step hints.
- Self-signed CA without bundle shows up as `TlsUnknownAuthority` on Linux (PartialChain/UntrustedRoot); no HTTP
  request (so no token) reaches the server in that case — asserted.

**Not done / follow-ups**
- No `CapturedLogs`/`TokenLeakScanner` yet (BACKEND.md lists them for Api integration tests); this task uses a local
  `RecordingLogger<T>` on the adapter. When those land, T-0020's endpoint tests should scan with them.
- Intermediate-only CA bundles: every bundle cert is put into `CustomTrustStore`, but whether .NET (Linux) accepts a
  non-self-signed cert there as an anchor is **unverified** — only root-CA bundles are tested. Add a test if admins
  report intermediate-only bundles failing.
- CP2's pool: `TlsValidationRecord` never clears; long-lived handlers need a fresh record per connection attempt.
- The probe honours the process's default proxy settings (`HTTPS_PROXY`/`NO_PROXY`); a proxy failure is reported as
  `ConnectionRefused`. Revisit if console deployments need per-cluster proxies.
- (architect, review round 1) CP2 pool: `TlsValidationRecord` is never cleared, so a long-lived pooled handler must
  get a fresh record per connection attempt (or clear it on success). Otherwise an old rejection misclassifies later
  TLS failures.
