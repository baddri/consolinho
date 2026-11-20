namespace FleetConsole.Application.Proxy.Requests;

/// <summary>
/// What a proxied path addresses in Kubernetes terms — group, version, namespace, resource, name, subresource —
/// parsed like the apiserver's <c>RequestInfoFactory</c> (ADR-0019 §3). Policies decide on it and audit records its
/// <see cref="DisplayName"/>.
/// </summary>
/// <remarks>
/// Segments are percent-decoded before parsing (<see cref="Uri.UnescapeDataString(string)"/>, so <c>+</c> stays
/// <c>+</c>), because the apiserver routes on the decoded path: <c>…/pods/b/%65xec</c> <em>is</em> <c>exec</c> upstream
/// and must classify as such (ADR-0019 §2). Only <see cref="Path"/> stays raw — it is what gets forwarded.
/// <see cref="ProxyPath"/> already refused encoded <c>/</c>, <c>\</c>, <c>.</c> and control characters, so a decoded
/// segment can never split, traverse or inject a line. Non-resource requests (<c>/version</c>, <c>/openapi/…</c>, <c>/.well-known/…</c> and the discovery roots
/// <c>/api</c>, <c>/api/&lt;v&gt;</c>, <c>/apis</c>, <c>/apis/&lt;g&gt;</c>, <c>/apis/&lt;g&gt;/&lt;v&gt;</c>) have only
/// <see cref="Path"/> set.
/// </remarks>
/// <param name="IsResourceRequest"><see langword="true"/> when the path addresses a resource (collection or object).</param>
/// <param name="Path">The validated, still-encoded path (as forwarded).</param>
/// <param name="Group">API group; <c>""</c> for the core group; <see langword="null"/> for non-resource requests.</param>
/// <param name="Version">API version (e.g. <c>v1</c>); <see langword="null"/> for non-resource requests.</param>
/// <param name="Namespace">
/// Namespace of a namespaced request; <see langword="null"/> for cluster-scoped requests, including the namespace
/// object itself (<c>namespaces/&lt;ns&gt;</c>).
/// </param>
/// <param name="Resource">Plural resource name (e.g. <c>pods</c>).</param>
/// <param name="Subresource">Subresource (e.g. <c>log</c>, <c>scale</c>, <c>exec</c>), if any.</param>
/// <param name="Name">Object name; <see langword="null"/> for collection requests.</param>
public sealed record KubernetesRequestInfo(
    bool IsResourceRequest,
    string Path,
    string? Group,
    string? Version,
    string? Namespace,
    string? Resource,
    string? Subresource,
    string? Name)
{
    // Subresources of the namespace object; anything else after namespaces/<ns> is a namespaced resource.
    private static readonly HashSet<string> NamespaceSubresources = new(StringComparer.Ordinal) { "status", "finalize" };

    /// <summary>
    /// <see langword="true"/> when the path used the legacy <c>/watch/</c> prefix after the version
    /// (e.g. <c>/api/v1/watch/namespaces/a/pods</c>), which makes the request a watch regardless of the query.
    /// </summary>
    internal bool IsLegacyWatch { get; init; }

    /// <summary>
    /// <see langword="true"/> when the path used the legacy <c>/proxy/</c> prefix after the version. Modern apiservers
    /// no longer serve it, but it is classified as <see cref="KubernetesVerb.Connect"/> so it can never pass as a read.
    /// </summary>
    internal bool IsLegacyProxy { get; init; }

    /// <summary>
    /// kubectl-style label for audit and logs: <c>shop/configmaps/web</c>, <c>shop/deployments.apps/web/scale</c>,
    /// <c>namespaces/shop</c>, <c>shop/pods</c>, <c>nodes.metrics.k8s.io/n1</c>; the path for non-resource requests.
    /// </summary>
    public string DisplayName => IsResourceRequest ? BuildDisplayName() : Path;

    /// <summary>Parses a validated path. Never fails: anything without a resource is a non-resource request.</summary>
    /// <param name="path">The validated path.</param>
    /// <returns>The request info.</returns>
    public static KubernetesRequestInfo Parse(ProxyPath path)
    {
        ArgumentNullException.ThrowIfNull(path);

        // ProxyPath forbids "//", so trimming the leading/trailing slash leaves no empty segments. Splitting before
        // decoding is safe because "%2f" is rejected, so decoding never introduces a separator.
        var parts = Array.ConvertAll(path.Value.Trim('/').Split('/'), Uri.UnescapeDataString);
        var nonResource = new KubernetesRequestInfo(false, path.Value, null, null, null, null, null, null);

        // Like RequestInfoFactory: a resource request needs at least prefix + version + resource (core) or
        // prefix + group + version + resource (named group); shorter paths are discovery documents.
        string group;
        int rest;
        switch (parts[0])
        {
            case "api" when parts.Length >= 3:
                group = string.Empty;
                rest = 1;
                break;
            case "apis" when parts.Length >= 4:
                group = parts[1];
                rest = 2;
                break;
            default:
                return nonResource;
        }

        var version = parts[rest];
        var current = parts.AsSpan(rest + 1);

        // Legacy special verbs: /api/v1/watch/... and /api/v1/proxy/... — the verb segment alone addresses nothing.
        var legacyWatch = current[0] == "watch";
        var legacyProxy = current[0] == "proxy";
        if (legacyWatch || legacyProxy)
        {
            if (current.Length < 2)
            {
                return nonResource;
            }

            current = current[1..];
        }

        string? ns = null;
        if (current[0] == "namespaces" && current.Length > 1)
        {
            if (current.Length > 2 && !NamespaceSubresources.Contains(current[2]))
            {
                // namespaces/<ns>/<resource>/... — a namespaced resource.
                ns = current[1];
                current = current[2..];
            }

            // Otherwise the namespace object itself (namespaces/<ns>[/status|/finalize]): cluster-scoped, so
            // Namespace stays null and "namespaces" is parsed below as the resource with <ns> as the name.
        }

        var resource = current[0];
        var name = current.Length > 1 ? current[1] : null;
        // The legacy proxy verb treats everything after the name as a proxied path, never a subresource.
        var subresource = current.Length > 2 && !legacyProxy ? current[2] : null;

        return new KubernetesRequestInfo(true, path.Value, group, version, ns, resource, subresource, name)
        {
            IsLegacyWatch = legacyWatch,
            IsLegacyProxy = legacyProxy,
        };
    }

    private string BuildDisplayName()
    {
        var resource = string.IsNullOrEmpty(Group) ? Resource : $"{Resource}.{Group}";
        string?[] parts = [Namespace, resource, Name, Name is null ? null : Subresource];
        return string.Join('/', parts.Where(part => part is not null));
    }
}
