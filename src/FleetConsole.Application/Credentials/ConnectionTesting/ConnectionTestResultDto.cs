using FleetConsole.Application.Abstractions.Kubernetes;
using System.Text.Json.Serialization;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials.ConnectionTesting;

/// <summary>
/// The full result of one connection test (TEST-2..4, contract §8.5): the six steps in order, what the cluster told us,
/// the capability summary and the grant-mode hints. Returned by <c>TestCredential</c> and <c>TestToken</c>; only its
/// summary (<see cref="ConnectionTestSummary"/>) is ever stored (TEST-5).
/// </summary>
/// <param name="Succeeded">True when no step failed; warnings are allowed.</param>
/// <param name="TestedAt">When the test started.</param>
/// <param name="DurationMs">How long the test took, in milliseconds.</param>
/// <param name="Steps">Always all six steps, in execution order; steps after a failed one are skipped.</param>
/// <param name="KubernetesVersion">The API server's gitVersion (e.g. v1.31.4), when the version endpoint answered.</param>
/// <param name="Identity">Who the cluster sees the token as, when known.</param>
/// <param name="OpenShiftVersion">The OpenShift version, when the ClusterVersion resource was visible.</param>
/// <param name="DetectedDistribution">What API discovery shows the cluster to be (<c>config.openshift.io</c> served ⇒
/// OpenShift, ADR-0032); null when discovery was not readable or the test stopped before the step. A presentation hint
/// only (it is compared with the declared distribution); what the UI may do comes from discovery itself.</param>
/// <param name="Capabilities">The capability summary, when the capabilities step ran to completion.</param>
/// <param name="NamespaceRules">One entry per requested namespace, in the (normalised) request order (NST-3); each holds
/// either the token's rules there or why they could not be reviewed. Never null: empty when no namespaces were given or
/// the capabilities step did not complete.</param>
/// <param name="Hints">Advice about the credential's grants (TEST-4); empty when there is nothing to say.</param>
public sealed record ConnectionTestResultDto(
    bool Succeeded,
    DateTimeOffset TestedAt,
    int DurationMs,
    IReadOnlyList<ConnectionTestStepResultDto> Steps,
    string? KubernetesVersion,
    ClusterIdentityDto? Identity,
    OpenShiftVersionDto? OpenShiftVersion,
    ClusterDistribution? DetectedDistribution,
    CapabilitySummaryDto? Capabilities,
    IReadOnlyList<NamespaceRulesDto> NamespaceRules,
    IReadOnlyList<ConnectionTestHintDto> Hints);

/// <summary>The outcome of one connection test step.</summary>
/// <param name="Step">The step.</param>
/// <param name="Status">Passed, warning, failed or skipped.</param>
/// <param name="Message">A human-readable explanation, meant to be shown verbatim.</param>
/// <param name="FailureKind">The categorized cause for failed steps and for warnings caused by a failed call; otherwise null.</param>
public sealed record ConnectionTestStepResultDto(
    ConnectionTestStep Step, ConnectionTestStepStatus Status, string Message, ProbeFailureKind? FailureKind);

/// <summary>The identity the cluster associates with the tested token.</summary>
/// <param name="Username">The Kubernetes username, e.g. system:serviceaccount:fleet:viewer.</param>
/// <param name="Source">Whether the cluster reported it or it was read from the token's subject claim.</param>
public sealed record ClusterIdentityDto(string Username, IdentitySource Source);

/// <summary>The cluster's OpenShift version from its ClusterVersion resource.</summary>
/// <param name="Version">The desired (current) version, e.g. 4.17.3.</param>
/// <param name="UpdateProgressing">True while a cluster update is in progress.</param>
public sealed record OpenShiftVersionDto(string Version, bool UpdateProgressing);

/// <summary>What the token may do cluster-wide (TEST-3).</summary>
/// <param name="Headline">The overall capability level.</param>
/// <param name="Checks">Every evaluated check in a stable order; render the list as received.</param>
public sealed record CapabilitySummaryDto(CapabilityLevel Headline, IReadOnlyList<CapabilityCheckResultDto> Checks);

/// <summary>The answer to one capability check (an access review across all namespaces).</summary>
/// <param name="Id">Stable id, e.g. list-pods.</param>
/// <param name="Label">Human-readable label, e.g. List pods.</param>
/// <param name="Category">Whether the check is about reading or writing.</param>
/// <param name="Allowed">Whether the cluster allows it.</param>
public sealed record CapabilityCheckResultDto(string Id, string Label, CapabilityCategory Category, bool Allowed);

/// <summary>
/// The token's access rules in one inspected namespace (a SelfSubjectRulesReview), or why they could not be reviewed
/// (NST-3). <b>Exactly one of <see cref="Rules"/> and <see cref="Error"/> is non-null</b>; this holds by construction
/// because instances are only made through the <see cref="Reviewed"/> and <c>Failed</c> factories. One failed namespace never
/// fails the others or the test.
/// </summary>
public sealed record NamespaceRulesDto
{
    // Private: the factories are the only way in, so "exactly one of rules/error" can't be broken. [JsonConstructor]
    // makes System.Text.Json (and so the OpenAPI schema / schema.gen.ts) treat all six fields as required, like the
    // positional DTOs; the parameter names match the properties for that reason.
    [JsonConstructor]
    private NamespaceRulesDto(
        string @namespace, bool incomplete, string? evaluationError, IReadOnlyList<ResourceRuleDto>? rules, string? error, ProbeFailureKind? failureKind)
    {
        Namespace = @namespace;
        Incomplete = incomplete;
        EvaluationError = evaluationError;
        Rules = rules;
        Error = error;
        FailureKind = failureKind;
    }

    /// <summary>The inspected namespace.</summary>
    public string Namespace { get; }

    /// <summary>True when the cluster could not evaluate all rules; always false when <see cref="Error"/> is set.</summary>
    public bool Incomplete { get; }

    /// <summary>The cluster's explanation when the list is incomplete; null when <see cref="Error"/> is set.</summary>
    public string? EvaluationError { get; }

    /// <summary>The resource rules when the review succeeded; null exactly when <see cref="Error"/> is set.</summary>
    public IReadOnlyList<ResourceRuleDto>? Rules { get; }

    /// <summary>Why the rules could not be reviewed, shown verbatim; null exactly when <see cref="Rules"/> is set.</summary>
    public string? Error { get; }

    /// <summary>The categorized cause when <see cref="Error"/> is set; otherwise null.</summary>
    public ProbeFailureKind? FailureKind { get; }

    /// <summary>A namespace whose rules were reviewed.</summary>
    /// <param name="namespace">The namespace.</param>
    /// <param name="incomplete">Whether the cluster could not evaluate all rules.</param>
    /// <param name="evaluationError">The cluster's explanation when incomplete.</param>
    /// <param name="rules">The resource rules.</param>
    /// <returns>The entry, with no error.</returns>
    public static NamespaceRulesDto Reviewed(
        string @namespace, bool incomplete, string? evaluationError, IReadOnlyList<ResourceRuleDto> rules)
    {
        ArgumentNullException.ThrowIfNull(@namespace);
        ArgumentNullException.ThrowIfNull(rules);
        return new NamespaceRulesDto(@namespace, incomplete, evaluationError, rules, null, null);
    }

    /// <summary>A namespace whose rules could not be reviewed.</summary>
    /// <param name="namespace">The namespace.</param>
    /// <param name="kind">The categorized cause.</param>
    /// <param name="error">The message to show (free of the token).</param>
    /// <returns>The entry, with no rules.</returns>
    public static NamespaceRulesDto Failed(string @namespace, ProbeFailureKind kind, string error)
    {
        ArgumentNullException.ThrowIfNull(@namespace);
        ArgumentException.ThrowIfNullOrWhiteSpace(error);
        return new NamespaceRulesDto(@namespace, false, null, null, error, kind);
    }
}

/// <summary>One resource rule: these verbs on these resources (optionally only these names) in these API groups.</summary>
/// <param name="Verbs">The verbs, e.g. get, list.</param>
/// <param name="ApiGroups">The API groups; an empty string is the core group.</param>
/// <param name="Resources">The resources, possibly with a subresource (pods/log).</param>
/// <param name="ResourceNames">Restricts the rule to these names; empty means all.</param>
public sealed record ResourceRuleDto(
    IReadOnlyList<string> Verbs, IReadOnlyList<string> ApiGroups, IReadOnlyList<string> Resources, IReadOnlyList<string> ResourceNames);

/// <summary>Advice derived from the test and the credential's grants (TEST-4).</summary>
/// <param name="Severity">Info or warning.</param>
/// <param name="Message">The advice, meant to be shown verbatim.</param>
public sealed record ConnectionTestHintDto(HintSeverity Severity, string Message);

/// <summary>The outcome of a connection test step.</summary>
public enum ConnectionTestStepStatus
{
    /// <summary>The step succeeded.</summary>
    Passed,

    /// <summary>The step found something worth attention but the test went on.</summary>
    Warning,

    /// <summary>The step failed; later steps are skipped.</summary>
    Failed,

    /// <summary>The step did not run because an earlier step failed.</summary>
    Skipped,
}

/// <summary>Whether a capability check is about reading or changing resources.</summary>
public enum CapabilityCategory
{
    /// <summary>Reading (get, list).</summary>
    Read,

    /// <summary>Changing (create, update, patch, delete).</summary>
    Write,
}

/// <summary>The severity of a connection test hint.</summary>
public enum HintSeverity
{
    /// <summary>Informational.</summary>
    Info,

    /// <summary>Likely a misconfiguration.</summary>
    Warning,
}

/// <summary>Where the identity of a tested token came from.</summary>
public enum IdentitySource
{
    /// <summary>The cluster reported it (SelfSubjectReview).</summary>
    SelfSubjectReview,

    /// <summary>The cluster could not report it; read from the token's subject claim (not verified).</summary>
    TokenSubject,
}
