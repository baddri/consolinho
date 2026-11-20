using System.Globalization;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Proxy;

/// <summary>
/// Errors FleetConsole itself raises for proxied Kubernetes requests. Codes and messages are part of the API contract
/// (<c>docs/specs/CP2-api-contract.md</c> §4); the SPA shows <c>detail</c> verbatim and tells them apart from the
/// cluster's own <c>Status</c> bodies by the <c>Proxy.</c> code prefix.
/// </summary>
/// <remarks>
/// The <see cref="ErrorType"/> is only a fallback: the Api's <c>ProxyProblems</c> maps each code to its HTTP status
/// (ADR-0019 §8), because 413/502/504 have no <see cref="ErrorType"/>.
/// </remarks>
public static class ProxyErrors
{
    /// <summary>Code of the "cluster not available" errors (unknown/disabled cluster, no grant, …) → 404.</summary>
    public const string NotAvailableCode = "Proxy.NotAvailable";

    private const string NotAvailableReason = "it does not exist or you don't have access.";

    /// <summary>
    /// The path is outside the allowlist or contains traversal/encoded separators → 400. Not a field error: there is
    /// nothing the user can correct in a form.
    /// </summary>
    public static readonly Error PathNotAllowed =
        Error.Validation("Proxy.PathNotAllowed", "This Kubernetes API path is not allowed through the console.");

    /// <summary>A WebSocket upgrade came from an <c>Origin</c> other than the console's own (ADR-0019 §9) → 403.</summary>
    public static readonly Error OriginNotAllowed =
        Error.Forbidden("Proxy.OriginNotAllowed", "WebSocket connections must come from the console itself.");

    /// <summary>A globally read-only user attempted a mutation (MUT-3; checked before the grant) → 403.</summary>
    public static readonly Error UserReadOnly = Error.Forbidden("Proxy.UserReadOnly", "Your account is read-only.");

    /// <summary>
    /// <see cref="NotAvailable"/> for a cluster name that is not even well-formed: same code and status, but the junk
    /// from the URL is not echoed back.
    /// </summary>
    public static readonly Error NotAvailableUnnamed =
        Error.NotFound(NotAvailableCode, $"This cluster is not available — {NotAvailableReason}");

    /// <summary>
    /// The cluster is unknown or disabled, the user has no grant on it, is deactivated, or the grant's credential is
    /// missing (PRX-2) → 404. One identical body for all cases, so the response doesn't reveal which clusters exist.
    /// </summary>
    /// <param name="cluster">The cluster name from the URL (already well-formed).</param>
    /// <returns>A <c>Proxy.NotAvailable</c> error.</returns>
    public static Error NotAvailable(string cluster) =>
        Error.NotFound(NotAvailableCode, $"Cluster {cluster} is not available — {NotAvailableReason}");

    /// <summary>The user's grant on the cluster is read-only and the request is a mutation (MUT-2) → 403.</summary>
    /// <param name="cluster">The cluster name.</param>
    /// <returns>A <c>Proxy.ReadOnlyGrant</c> error.</returns>
    public static Error ReadOnlyGrant(string cluster) =>
        Error.Forbidden("Proxy.ReadOnlyGrant", $"Your access to {cluster} is read-only.");

    /// <summary>A mutation declared a body larger than <c>Proxy:MaxMutationBodyBytes</c> (MUT-5) → 413.</summary>
    /// <param name="limitBytes">The configured limit.</param>
    /// <returns>A <c>Proxy.BodyTooLarge</c> error.</returns>
    public static Error BodyTooLarge(long limitBytes) =>
        Error.Failure("Proxy.BodyTooLarge", $"The request body is larger than the {FormatSize(limitBytes)} limit.");

    /// <summary>
    /// The cluster answered 401 to the assigned ServiceAccount token → 502. Deliberately not 401: the user's console
    /// session is fine and must not be ended.
    /// </summary>
    /// <param name="cluster">The cluster name.</param>
    /// <returns>A <c>Proxy.CredentialRejected</c> error.</returns>
    public static Error CredentialRejected(string cluster) =>
        Error.Failure(
            "Proxy.CredentialRejected",
            $"The cluster rejected the credential assigned to you for {cluster}. Ask a Fleet administrator to rotate it.");

    /// <summary>DNS or connection failure reaching the cluster → 502.</summary>
    /// <param name="cluster">The cluster name.</param>
    /// <returns>A <c>Proxy.UpstreamUnavailable</c> error.</returns>
    public static Error UpstreamUnavailable(string cluster) =>
        Error.Failure("Proxy.UpstreamUnavailable", $"{cluster} is not reachable.");

    /// <summary>The cluster's TLS certificate failed validation → 502.</summary>
    /// <param name="cluster">The cluster name.</param>
    /// <returns>A <c>Proxy.UpstreamTls</c> error.</returns>
    public static Error UpstreamTls(string cluster) =>
        Error.Failure("Proxy.UpstreamTls", $"The TLS certificate of {cluster} could not be verified.");

    /// <summary>No upstream activity within <c>Proxy:RequestTimeout</c> on a non-streaming request → 504.</summary>
    /// <param name="cluster">The cluster name.</param>
    /// <returns>A <c>Proxy.UpstreamTimeout</c> error.</returns>
    public static Error UpstreamTimeout(string cluster) =>
        Error.Failure("Proxy.UpstreamTimeout", $"{cluster} did not respond in time.");

    // "10 MiB" for whole mebibytes (the default and any sensible setting), the exact byte count otherwise.
    private static string FormatSize(long bytes)
    {
        const long mebibyte = 1024 * 1024;
        return bytes > 0 && bytes % mebibyte == 0
            ? string.Create(CultureInfo.InvariantCulture, $"{bytes / mebibyte} MiB")
            : string.Create(CultureInfo.InvariantCulture, $"{bytes} bytes");
    }
}
