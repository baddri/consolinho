using System.Globalization;

namespace FleetConsole.Application.Proxy.Requests;

/// <summary>
/// A classified proxied Kubernetes API call: everything the authorization query, the proxy policies, the forwarder
/// and audit need to know about it, computed once from the raw request (ADR-0019 §3–4, MUT-1, MUT-4).
/// </summary>
/// <remarks>Build it with <see cref="Create"/>; the positional constructor does not classify.</remarks>
/// <param name="Method">HTTP method as received (case-sensitive, like HTTP).</param>
/// <param name="Path">The validated, still-encoded path.</param>
/// <param name="QueryString">The raw query string: <c>""</c> or <c>"?a=b"</c>, never decoded or re-encoded.</param>
/// <param name="Info">What the path addresses.</param>
/// <param name="Verb">The Kubernetes verb.</param>
/// <param name="IsMutation">
/// <see langword="true"/> when a read-only user/grant must not send it: any method other than GET/HEAD/OPTIONS
/// (except SelfSubjectAccessReview/SelfSubjectRulesReview creation, which only asks a question) and any
/// <see cref="KubernetesVerb.Connect"/>. A <c>dryRun</c> parameter does not change this.
/// </param>
/// <param name="IsWatch"><see langword="true"/> for <c>watch=true|1</c> or the legacy <c>/watch/</c> prefix.</param>
/// <param name="IsStreaming">
/// <see langword="true"/> when the response is long-lived (watch, <c>follow=true</c>, or a protocol upgrade) and must
/// be streamed, never buffered, and not bound by the normal request timeout.
/// </param>
/// <param name="ContentLength">The declared request body length, if any (used by the body-size policy).</param>
/// <param name="DryRun">First decoded <c>dryRun</c> value (case-sensitive key), for audit; <see langword="null"/> if absent.</param>
/// <param name="FieldManager">First decoded <c>fieldManager</c> value (case-sensitive key), for audit; <see langword="null"/> if absent.</param>
/// <param name="Container">
/// First decoded <c>container</c> value for a <see cref="KubernetesVerb.Connect"/> request (exec/attach), for audit;
/// otherwise <see langword="null"/>. Only connect requests carry it into audit: a log read's <c>container</c> is never
/// audited (LOG-9), and every other verb has no such parameter. The exec <c>command</c> values are deliberately never
/// parsed or recorded — users type secrets into them (ADR-0036 §5).
/// </param>
public sealed record ProxyRequest(
    string Method,
    ProxyPath Path,
    string QueryString,
    KubernetesRequestInfo Info,
    KubernetesVerb Verb,
    bool IsMutation,
    bool IsWatch,
    bool IsStreaming,
    long? ContentLength,
    string? DryRun,
    string? FieldManager,
    string? Container)
{
    private const string TimeoutSecondsParameter = "timeoutSeconds";

    // Subresources that open a channel into a workload or arbitrary in-cluster HTTP. "proxy" is a deliberate
    // tightening of MUT-1 (ADR-0019 §4).
    private static readonly HashSet<string> ConnectSubresources =
        new(StringComparer.Ordinal) { "exec", "attach", "portforward", "proxy" };

    // POSTs to these only ask "may I?" and change nothing, so a read-only user may send them.
    private static readonly HashSet<string> ReviewResources =
        new(StringComparer.Ordinal) { "selfsubjectaccessreviews", "selfsubjectrulesreviews" };

    /// <summary>Parses and classifies a request.</summary>
    /// <param name="method">HTTP method as received.</param>
    /// <param name="path">The validated path.</param>
    /// <param name="queryString">The raw query string: <c>""</c> or starting with <c>?</c>.</param>
    /// <param name="isUpgrade"><see langword="true"/> for an HTTP upgrade (WebSocket) request.</param>
    /// <param name="contentLength">The declared request body length, if any.</param>
    /// <returns>The classified request.</returns>
    /// <exception cref="ArgumentException"><paramref name="queryString"/> is neither empty nor starts with <c>?</c>.</exception>
    public static ProxyRequest Create(string method, ProxyPath path, string queryString, bool isUpgrade, long? contentLength)
    {
        ArgumentException.ThrowIfNullOrEmpty(method);
        ArgumentNullException.ThrowIfNull(path);
        ArgumentNullException.ThrowIfNull(queryString);
        if (queryString.Length > 0 && queryString[0] != '?')
        {
            throw new ArgumentException("The query string must be empty or start with '?'.", nameof(queryString));
        }

        var info = KubernetesRequestInfo.Parse(path);

        var isWatch = info.IsLegacyWatch || IsTrue(KubernetesQuery.First(queryString, "watch"));
        var isRead = method is "GET" or "HEAD" or "OPTIONS";
        var verb = ClassifyVerb(method, info, isRead, isWatch);
        var isMutation = verb == KubernetesVerb.Connect || (!isRead && !IsSelfReview(method, info));
        var isStreaming = isWatch || isUpgrade || IsTrue(KubernetesQuery.First(queryString, "follow"));

        return new ProxyRequest(
            method, path, queryString, info, verb, isMutation, isWatch, isStreaming, contentLength,
            KubernetesQuery.First(queryString, "dryRun"), KubernetesQuery.First(queryString, "fieldManager"),
            verb == KubernetesVerb.Connect ? KubernetesQuery.First(queryString, "container") : null);
    }

    /// <summary>
    /// The query string to send upstream. For watches, <c>timeoutSeconds</c> becomes
    /// <c>min(requested, <paramref name="watchTimeoutCapSeconds"/>)</c> — added when absent, replaced by the cap when not
    /// a positive integer — so open watches end and re-authorize (PRX-8, ADR-0020 §5). Other requests: unchanged.
    /// </summary>
    /// <remarks>
    /// Edits the raw string: every other parameter (including pairs the apiserver would ignore) keeps its exact
    /// encoding and order; keys match case-sensitively like Go's <c>url.Values</c>. A <c>timeoutSeconds</c> value
    /// replaces the first occurrence in place and further occurrences are dropped.
    /// </remarks>
    /// <param name="watchTimeoutCapSeconds">The configured cap (<c>Proxy:WatchTimeoutCap</c>), in seconds; positive.</param>
    /// <returns><c>""</c> or a string starting with <c>?</c>.</returns>
    public string ForwardedQueryString(int watchTimeoutCapSeconds)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(watchTimeoutCapSeconds);
        if (!IsWatch)
        {
            return QueryString;
        }

        var pairs = KubernetesQuery.Pairs(QueryString);
        var kept = new List<string>(pairs.Length + 1);
        int? timeoutIndex = null;
        string? requested = null;
        foreach (var pair in pairs)
        {
            // Pairs the apiserver ignores (malformed, ';') or with another key — case-sensitively — pass through as-is.
            if (!KubernetesQuery.TryParsePair(pair, out var key, out var pairValue)
                || !string.Equals(key, TimeoutSecondsParameter, StringComparison.Ordinal))
            {
                kept.Add(pair);
                continue;
            }

            // Like the apiserver, the first value counts; later duplicates are dropped so none can override the cap.
            if (timeoutIndex is null)
            {
                timeoutIndex = kept.Count;
                requested = pairValue;
                kept.Add(string.Empty); // placeholder, replaced below
            }
        }

        // 0 or a negative value would mean "server default" (much longer than the cap), so they count as garbage.
        var seconds = long.TryParse(requested, NumberStyles.None, CultureInfo.InvariantCulture, out var value) && value > 0
            ? Math.Min(value, watchTimeoutCapSeconds)
            : watchTimeoutCapSeconds;
        var timeout = string.Create(CultureInfo.InvariantCulture, $"{TimeoutSecondsParameter}={seconds}");

        if (timeoutIndex is { } index)
        {
            kept[index] = timeout;
        }
        else
        {
            kept.Add(timeout);
        }

        return "?" + string.Join('&', kept);
    }

    private static KubernetesVerb ClassifyVerb(string method, KubernetesRequestInfo info, bool isRead, bool isWatch)
    {
        if (info.IsLegacyProxy || (info.Subresource is { } sub && ConnectSubresources.Contains(sub)))
        {
            return KubernetesVerb.Connect;
        }

        // Non-resource paths have no collection; they count as "named" (get/delete) like in the apiserver.
        var isCollection = info.IsResourceRequest && info.Name is null;
        return method switch
        {
            _ when isRead && isWatch && info.IsResourceRequest => KubernetesVerb.Watch,
            _ when isRead => isCollection ? KubernetesVerb.List : KubernetesVerb.Get,
            "POST" => KubernetesVerb.Create,
            "PUT" => KubernetesVerb.Update,
            "PATCH" => KubernetesVerb.Patch,
            "DELETE" => isCollection ? KubernetesVerb.DeleteCollection : KubernetesVerb.Delete,
            _ => KubernetesVerb.Other,
        };
    }

    // POST to the cluster-scoped review collection in authorization.k8s.io/v1 only — another group/version, a
    // namespace, a name or a subresource is not that endpoint and stays a mutation.
    private static bool IsSelfReview(string method, KubernetesRequestInfo info) =>
        method == "POST"
        && info is { IsResourceRequest: true, Group: "authorization.k8s.io", Version: "v1", Namespace: null, Name: null, Subresource: null }
        && ReviewResources.Contains(info.Resource!);

    // Mirrors Go's strconv.ParseBool true values, which the apiserver uses for watch/follow.
    private static bool IsTrue(string? value) => value is "1" or "t" or "T" or "true" or "TRUE" or "True";
}
