namespace FleetConsole.Application.Proxy.Requests;

/// <summary>
/// The Kubernetes authorization verb of a proxied request, derived like the apiserver's <c>RequestInfoFactory</c> from
/// HTTP method, path shape and query. Policies and audit use it instead of the raw HTTP method.
/// </summary>
public enum KubernetesVerb
{
    /// <summary>GET/HEAD/OPTIONS of a named object (or of a non-resource path).</summary>
    Get,

    /// <summary>GET/HEAD/OPTIONS of a collection.</summary>
    List,

    /// <summary>A watch: <c>watch=true</c> or the legacy <c>/watch/</c> path prefix.</summary>
    Watch,

    /// <summary>POST.</summary>
    Create,

    /// <summary>PUT.</summary>
    Update,

    /// <summary>PATCH.</summary>
    Patch,

    /// <summary>DELETE of a named object (or of a non-resource path).</summary>
    Delete,

    /// <summary>DELETE of a collection.</summary>
    DeleteCollection,

    /// <summary>
    /// Any method on the <c>exec</c>, <c>attach</c>, <c>portforward</c> or <c>proxy</c> subresources (or the legacy
    /// <c>/proxy/</c> prefix): reaches into workloads, so it is always a mutation (ADR-0019 §4).
    /// </summary>
    Connect,

    /// <summary>Any other HTTP method (e.g. TRACE); treated as a mutation.</summary>
    Other,
}
