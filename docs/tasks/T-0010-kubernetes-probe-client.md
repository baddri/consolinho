---
id: T-0010
title: Kubernetes probe client with categorized TLS/network failures, and the fake kube-apiserver test harness
status: todo
owner: backend-engineer
checkpoint: 1
depends_on: []
paths: [src/FleetConsole.Application/Abstractions/Kubernetes/, src/FleetConsole.Application/Abstractions/SensitiveString.cs, src/FleetConsole.Infrastructure/Kubernetes/, src/FleetConsole.Infrastructure/DependencyInjection.cs, tests/FleetConsole.Api.Tests/Kubernetes/, tests/FleetConsole.Api.Tests/Fakes/, tests/FleetConsole.Application.Tests/Abstractions/]
review_rounds: 0
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
- [ ] Tests against the fake server cover: OK `/version`; 401; 403; 404; CA-bundle trust OK; unknown authority (no
      bundle, self-signed); hostname mismatch; expired cert; skip-TLS accepts; connection refused (closed port); DNS
      failure (`*.invalid` host); timeout (server delays beyond token); SSAR/SSRR/ClusterVersion/SelfSubjectReview JSON
      parsing; the token is sent as `Bearer` and appears in no log output (QG-2 groundwork).
- [ ] `SensitiveString.ToString()` and a record containing it never print the value (unit test).
- [ ] XML docs; layering intact. Build, lint and tests green (CLAUDE.md rule 4).

## Work log

## Review

## Handover notes
