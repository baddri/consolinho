namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>The API server's version, from <c>GET /version</c>; proves the server is reachable and speaks Kubernetes.</summary>
/// <param name="GitVersion">The <c>gitVersion</c> field, e.g. <c>v1.31.4</c>.</param>
public sealed record KubernetesVersionInfo(string GitVersion);

/// <summary>Who the token authenticates as, from <c>authentication.k8s.io/v1</c> SelfSubjectReview.</summary>
/// <param name="Username">The authenticated user, e.g. <c>system:serviceaccount:ns:name</c>.</param>
/// <param name="Groups">The groups the API server attributes to the user.</param>
public sealed record SelfSubjectReviewInfo(string Username, IReadOnlyList<string> Groups);

/// <summary>The OpenShift version, from the <c>config.openshift.io/v1</c> ClusterVersion named <c>version</c>.</summary>
/// <param name="Version"><c>status.desired.version</c>, e.g. <c>4.17.3</c>.</param>
/// <param name="UpdateProgressing">True when the <c>Progressing</c> condition is <c>True</c> (an update is running).</param>
public sealed record ClusterVersionInfo(string Version, bool UpdateProgressing);

/// <summary>The API groups a cluster serves, from <c>GET /apis</c>; the connection test's distribution evidence (ADR-0032).</summary>
/// <param name="Names">The group names, e.g. <c>apps</c>, <c>config.openshift.io</c> (the core group is not listed there).</param>
public sealed record ServedApiGroups(IReadOnlyCollection<string> Names);

/// <summary>The request a SelfSubjectAccessReview asks about ("may I <em>verb</em> <em>resource</em>?").</summary>
/// <param name="Verb">Kubernetes verb (<c>get</c>, <c>list</c>, <c>patch</c>, <c>*</c>…).</param>
/// <param name="Group">API group; empty string for the core group, <c>*</c> for all.</param>
/// <param name="Resource">Resource plural (<c>pods</c>, <c>deployments</c>, <c>*</c>).</param>
/// <param name="Subresource">Optional subresource (<c>log</c>, <c>exec</c>, <c>scale</c>).</param>
/// <param name="Namespace">Namespace to ask about; <see langword="null"/> or empty = all namespaces (cluster-wide).</param>
public sealed record ResourceAttributes(
    string Verb, string Group, string Resource, string? Subresource = null, string? Namespace = null);

/// <summary>The API server's answer to a SelfSubjectAccessReview.</summary>
/// <param name="Allowed">Whether the request would be allowed.</param>
/// <param name="Reason">The authorizer's optional explanation (e.g. the RBAC binding that allowed it).</param>
public sealed record AccessReviewResult(bool Allowed, string? Reason);

/// <summary>
/// One resource rule from a SelfSubjectRulesReview: these verbs on these resources are allowed. Not named
/// <c>ResourceRule</c>: that is the API schema name of <c>ResourceRuleDto</c> (contract §8.5, SchemaNamingTests).
/// </summary>
/// <param name="Verbs">Allowed verbs.</param>
/// <param name="ApiGroups">API groups the rule applies to (empty string = core).</param>
/// <param name="Resources">Resources (and <c>resource/subresource</c>) the rule applies to.</param>
/// <param name="ResourceNames">If non-empty, the rule only applies to these object names.</param>
public sealed record KubernetesResourceRule(
    IReadOnlyList<string> Verbs, IReadOnlyList<string> ApiGroups, IReadOnlyList<string> Resources, IReadOnlyList<string> ResourceNames);

/// <summary>The API server's answer to a SelfSubjectRulesReview for one namespace.</summary>
/// <param name="Incomplete">True when some authorizer could not enumerate rules; the list may then be missing permissions.</param>
/// <param name="EvaluationError">The authorizer's error, if any, when <paramref name="Incomplete"/> is true.</param>
/// <param name="Rules">The allowed resource rules.</param>
public sealed record RulesReviewResult(bool Incomplete, string? EvaluationError, IReadOnlyList<KubernetesResourceRule> Rules);
