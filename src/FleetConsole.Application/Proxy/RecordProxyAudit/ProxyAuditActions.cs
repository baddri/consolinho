using FleetConsole.Application.Proxy.Requests;

namespace FleetConsole.Application.Proxy.RecordProxyAudit;

/// <summary>
/// The <c>proxy.*</c> audit actions (CP2 contract §5): one per mutating <see cref="KubernetesVerb"/>. The <c>proxy</c>
/// prefix maps to <c>AuditCategory.Proxy</c> in the domain.
/// </summary>
public static class ProxyAuditActions
{
    /// <summary>The action prefix shared by all proxy entries.</summary>
    public const string Prefix = "proxy.";

    /// <summary>Returns the audit action for a mutating verb, e.g. <c>proxy.delete_collection</c>.</summary>
    /// <param name="verb">The request's verb.</param>
    /// <returns>The action name.</returns>
    /// <exception cref="ArgumentException">
    /// <paramref name="verb"/> is a read (<c>Get</c>/<c>List</c>/<c>Watch</c>): reads are never audited (ADR-0021 §2),
    /// so reaching here is a programming error.
    /// </exception>
    public static string For(KubernetesVerb verb) => verb switch
    {
        KubernetesVerb.Create => Prefix + "create",
        KubernetesVerb.Update => Prefix + "update",
        KubernetesVerb.Patch => Prefix + "patch",
        KubernetesVerb.Delete => Prefix + "delete",
        KubernetesVerb.DeleteCollection => Prefix + "delete_collection",
        KubernetesVerb.Connect => Prefix + "connect",
        KubernetesVerb.Other => Prefix + "other",
        _ => throw new ArgumentException($"Verb '{verb}' is not an audited proxy mutation.", nameof(verb)),
    };
}
