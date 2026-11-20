namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// Everything needed to reach a managed cluster's API server over TLS, independent of the Domain model, so the
/// Kubernetes adapters (the connection-test probe now, the CP2 proxy later) can be built and tested on their own
/// (ADR-0011). Handlers build it from the cluster aggregate's endpoint.
/// </summary>
/// <param name="ApiUrl">Absolute <c>https</c> URL of the API server, e.g. <c>https://api.prod.example.com:6443</c>.
/// A path prefix, if present, is kept: requests are resolved relative to it.</param>
/// <param name="CaBundlePem">PEM-encoded CA certificate(s) to trust <em>instead of</em> the system trust store, or
/// <see langword="null"/> to use the system store.</param>
/// <param name="SkipTlsVerify">Accept any server certificate. Insecure; allowed but flagged loudly in the admin UI
/// (SECURITY.md "Proxy hardening"). Takes precedence over <paramref name="CaBundlePem"/>.</param>
public sealed record ClusterConnection(Uri ApiUrl, string? CaBundlePem, bool SkipTlsVerify);
