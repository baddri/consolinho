# 0011 — Connection test: step orchestration and capability probing
**Status:** Accepted (2026-11-18)

## Context
TEST-1..5 require a server-side test of (cluster, token) with five ordered steps, categorized TLS/network errors, a
capability summary built from `SelfSubjectAccessReview`s over a check set that "lives in one place", an optional
namespace `SelfSubjectRulesReview`, grant-mode hints, a 15 s overall timeout, and recording only a summary. QG-2
requires testing against a fake API server, not a real cluster.

## Decision
- **Two layers, split at the HTTP boundary.**
  - `Application/Abstractions/Kubernetes/IClusterProbeClient` — a low-level port. `Open(ClusterConnection,
    SensitiveString token)` returns an `IClusterProbeSession` (one TLS handler per test run) with one method per
    Kubernetes call (`GetVersionAsync`, `GetSelfSubjectReviewAsync`, `GetClusterVersionAsync`, `ReviewAccessAsync`,
    `ReviewRulesAsync`). Each returns `ProbeResponse<T>`: either a value or a `ProbeFailure(ProbeFailureKind, string
    Message)`. Kinds: `DnsFailure`, `ConnectionRefused`, `Timeout`, `TlsUnknownAuthority`, `TlsHostnameMismatch`,
    `TlsCertificateExpired`, `TlsOther`, `Unauthorized`, `Forbidden`, `NotFound`, `UnexpectedStatus`, `InvalidResponse`.
    `ClusterConnection(Uri ApiUrl, string? CaBundlePem, bool SkipTlsVerify)` is an Application record — no Domain
    types, so the adapter can be built independently of the domain model.
  - `Infrastructure/Kubernetes/ClusterProbeClient` implements it with a **short-lived** `SocketsHttpHandler` per test
    run (`ClusterTlsHandlerFactory`), never the CP2 forwarding pool. Custom trust uses
    `X509ChainPolicy.TrustMode = CustomRootTrust` with the CA bundle; the validation callback records
    `SslPolicyErrors`/chain status so TLS failures are categorized exactly. `ClusterTlsHandlerFactory` is the piece
    CP2's `ClusterHttpClientPool` will reuse.
  - `Application/Credentials/ConnectionTesting/ConnectionTester` orchestrates steps, timeouts, capability evaluation
    and hints. Pure logic over the port → unit-tested with a fake client.
- **Steps** (stop at the first *failed* step; later steps `skipped`):
  1. `reachability` — `GET /version` → `gitVersion`; network/TLS failures fail here.
  2. `authentication` — `POST /apis/authentication.k8s.io/v1/selfsubjectreviews`; 401 → failed. If the API returns
     404 (older clusters), authentication is decided by the first SSAR instead.
  3. `identity` — username from the SelfSubjectReview, else from the stored/parsed JWT `sub` (`warning` when neither).
  4. `openShiftVersion` — `GET /apis/config.openshift.io/v1/clusterversions/version`; 403/404 → `warning`
     "Not visible with this credential" (not a failure).
  5. `capabilities` — SSARs from the check set (cluster-scoped, `namespace` empty), run concurrently (max 4); an
     optional `SelfSubjectRulesReview` for `inspectNamespace`.
- **Check set in one class:** `CapabilityCheckSet` holds the ordered list of `CapabilityCheck(Id, Label, Category,
  Verb, Group, Resource, Subresource?)` and the headline rules (`clusterAdmin`: `* * *`; `clusterWideEdit`: patch
  deployments + delete pods + update configmaps; `clusterWideView`: list pods + list deployments + list namespaces;
  else `limited`). The API returns the evaluated list generically (`id`, `label`, `category`, `allowed`), so adding a
  check needs no UI or contract change.
- **Budget:** `Credentials:ConnectionTestTimeout` (default 15 s) as one linked `CancellationTokenSource` over all
  steps; a timeout fails the running step with `Timeout`, later steps `skipped`.
- **Recording (TEST-5):** only `ConnectionTestSummary(TestedAt, Succeeded, FailedStep?, Headline?)` is stored on the
  `Credential` (raises `CredentialTested` → audit). Raw responses and the token are never stored or logged. Testing an
  **unsaved** token stores nothing and is audited explicitly as `credential.token_tested` (ADR-0008 §4).
- **Fake kube-apiserver** test harness (`tests/FleetConsole.Api.Tests/Fakes/FakeKubeApiServer`): Kestrel on a random
  port with a generated self-signed CA + server cert, canned/scripted routes. Reused by CP2 proxy tests.

## Alternatives rejected
- The `KubernetesClient` NuGet package: large surface for five calls, and its exceptions blur the TLS failure
  categories the UI must show. We already own an `HttpClient` path for the proxy.
- Running the test through the CP2 proxy pipeline: wrong token (the test uses the credential directly, not a user
  grant) and the proxy doesn't exist yet.

## Consequences
- Adding a capability = one line in `CapabilityCheckSet` + a test row.
- TLS error categorization is unit-testable against the fake server with real certificates.
