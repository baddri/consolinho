using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Credentials.ConnectionTesting;

/// <summary>
/// The full result of one connection test (TEST-2..4, contract §8.5): the five steps in order, what the cluster told us,
/// the capability summary and the grant-mode hints. Returned by <c>TestCredential</c> and <c>TestToken</c>; only its
/// summary (<see cref="ConnectionTestSummary"/>) is ever stored (TEST-5).
/// </summary>
/// <param name="Succeeded">True when no step failed; warnings are allowed.</param>
/// <param name="TestedAt">When the test started.</param>
/// <param name="DurationMs">How long the test took, in milliseconds.</param>
/// <param name="Steps">Always all five steps, in execution order; steps after a failed one are skipped.</param>
/// <param name="KubernetesVersion">The API server's gitVersion (e.g. v1.31.4), when the version endpoint answered.</param>
/// <param name="Identity">Who the cluster sees the token as, when known.</param>
/// <param name="OpenShiftVersion">The OpenShift version, when the ClusterVersion resource was visible.</param>
/// <param name="Capabilities">The capability summary, when the capabilities step ran to completion.</param>
/// <param name="NamespaceRules">The token's rules in the inspected namespace; only when one was given and could be reviewed.</param>
/// <param name="Hints">Advice about the credential's grants (TEST-4); empty when there is nothing to say.</param>
public sealed record ConnectionTestResultDto(
    bool Succeeded,
    DateTimeOffset TestedAt,
    int DurationMs,
    IReadOnlyList<ConnectionTestStepResultDto> Steps,
    string? KubernetesVersion,
    ClusterIdentityDto? Identity,
    OpenShiftVersionDto? OpenShiftVersion,
    CapabilitySummaryDto? Capabilities,
    NamespaceRulesDto? NamespaceRules,
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

/// <summary>The token's access rules in one namespace (a SelfSubjectRulesReview).</summary>
/// <param name="Namespace">The inspected namespace.</param>
/// <param name="Incomplete">True when the cluster could not evaluate all rules (e.g. an authorizer that can't list them).</param>
/// <param name="EvaluationError">The cluster's explanation when the list is incomplete.</param>
/// <param name="Rules">The resource rules.</param>
public sealed record NamespaceRulesDto(
    string Namespace, bool Incomplete, string? EvaluationError, IReadOnlyList<ResourceRuleDto> Rules);

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
