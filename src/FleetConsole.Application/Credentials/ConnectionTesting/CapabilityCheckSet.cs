using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials.ConnectionTesting;

/// <summary>
/// One capability check of a connection test: a cluster-wide <c>SelfSubjectAccessReview</c> with a stable id and a label
/// for the UI (contract §8.5).
/// </summary>
/// <param name="Id">Stable id, e.g. <c>list-pods</c>.</param>
/// <param name="Label">Human-readable label.</param>
/// <param name="Category">Read or write.</param>
/// <param name="Attributes">The access review; no namespace, i.e. across all namespaces.</param>
public sealed record CapabilityCheck(string Id, string Label, CapabilityCategory Category, ResourceAttributes Attributes);

/// <summary>
/// The one place that defines what a connection test checks and how the capability headline is derived (ADR-0011).
/// Adding a capability = one line in <see cref="Checks"/> plus a test row; the API returns the list generically, so the
/// UI and contract don't change.
/// </summary>
public static class CapabilityCheckSet
{
    /// <summary>
    /// The cluster-admin probe (<c>* * *</c>). Not one of <see cref="Checks"/>: it isn't shown as a row, it only drives
    /// the <see cref="CapabilityLevel.ClusterAdmin"/> headline.
    /// </summary>
    public static ResourceAttributes ClusterAdmin { get; } = new("*", "*", "*");

    /// <summary>The checks, in the order they are reported (reads first, then writes).</summary>
    public static IReadOnlyList<CapabilityCheck> Checks { get; } =
    [
        Read("list-pods", "List pods", "list", "", "pods"),
        Read("list-deployments", "List deployments", "list", "apps", "deployments"),
        Read("list-events", "List events", "list", "", "events"),
        Read("get-pod-logs", "Read pod logs", "get", "", "pods", "log"),
        Read("list-secrets", "List secrets", "list", "", "secrets"),
        Read("list-nodes", "List nodes", "list", "", "nodes"),
        Read("list-clusteroperators", "List cluster operators", "list", "config.openshift.io", "clusteroperators"),
        Read("list-namespaces", "List namespaces", "list", "", "namespaces"),
        Write("patch-deployments", "Patch deployments", "patch", "apps", "deployments"),
        Write("delete-pods", "Delete pods", "delete", "", "pods"),
        Write("create-pods-exec", "Exec into pods", "create", "", "pods", "exec"),
        Write("update-configmaps", "Update config maps", "update", "", "configmaps"),
    ];

    // Headline rules (ADR-0011): every listed check must be allowed for the level.
    private static readonly string[] EditChecks = ["patch-deployments", "delete-pods", "update-configmaps"];
    private static readonly string[] ViewChecks = ["list-pods", "list-deployments", "list-namespaces"];

    /// <summary>
    /// Derives the headline (TEST-3): cluster-admin when <c>* * *</c> is allowed; else cluster-wide edit, cluster-wide
    /// view, or limited, by the check ids that must all be allowed for each level.
    /// </summary>
    /// <param name="allowedById">The answers by check id; a missing id counts as denied.</param>
    /// <param name="clusterAdmin">Whether the <see cref="ClusterAdmin"/> review was allowed.</param>
    /// <returns>The headline level.</returns>
    public static CapabilityLevel Evaluate(IReadOnlyDictionary<string, bool> allowedById, bool clusterAdmin)
    {
        ArgumentNullException.ThrowIfNull(allowedById);

        bool AllAllowed(string[] ids) => ids.All(id => allowedById.TryGetValue(id, out var allowed) && allowed);

        if (clusterAdmin)
        {
            return CapabilityLevel.ClusterAdmin;
        }

        if (AllAllowed(EditChecks))
        {
            return CapabilityLevel.ClusterWideEdit;
        }

        return AllAllowed(ViewChecks) ? CapabilityLevel.ClusterWideView : CapabilityLevel.Limited;
    }

    private static CapabilityCheck Read(string id, string label, string verb, string group, string resource, string? subresource = null) =>
        new(id, label, CapabilityCategory.Read, new ResourceAttributes(verb, group, resource, subresource));

    private static CapabilityCheck Write(string id, string label, string verb, string group, string resource, string? subresource = null) =>
        new(id, label, CapabilityCategory.Write, new ResourceAttributes(verb, group, resource, subresource));
}
