// Minimal wire shapes of the Kubernetes/OpenShift objects the probe reads and writes. Only the fields we use are
// declared; everything else in the server's answer is ignored. Instantiated by System.Text.Json, hence CA1812.
#pragma warning disable CA1812

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary><c>GET /version</c> answer.</summary>
internal sealed record VersionDto(string? GitVersion);

/// <summary>Body of a SelfSubjectReview / SelfSubjectAccessReview / SelfSubjectRulesReview POST.</summary>
internal sealed record ReviewRequestDto(string ApiVersion, string Kind, ReviewSpecDto? Spec);

/// <summary>The <c>spec</c> of a review request: resource attributes (access review) or a namespace (rules review).</summary>
internal sealed record ReviewSpecDto(ResourceAttributesDto? ResourceAttributes, string? Namespace);

/// <summary><c>spec.resourceAttributes</c>. <c>group</c> is always written: the empty string means the core group.</summary>
internal sealed record ResourceAttributesDto(string Verb, string Group, string Resource, string? Subresource, string? Namespace);

/// <summary><c>authentication.k8s.io/v1</c> SelfSubjectReview answer.</summary>
internal sealed record SelfSubjectReviewDto(SelfSubjectReviewStatusDto? Status);

/// <summary>SelfSubjectReview <c>status</c>.</summary>
internal sealed record SelfSubjectReviewStatusDto(UserInfoDto? UserInfo);

/// <summary>SelfSubjectReview <c>status.userInfo</c>.</summary>
internal sealed record UserInfoDto(string? Username, IReadOnlyList<string>? Groups);

/// <summary><c>config.openshift.io/v1</c> ClusterVersion.</summary>
internal sealed record ClusterVersionDto(ClusterVersionStatusDto? Status);

/// <summary>ClusterVersion <c>status</c>.</summary>
internal sealed record ClusterVersionStatusDto(ReleaseDto? Desired, IReadOnlyList<ConditionDto>? Conditions);

/// <summary>ClusterVersion <c>status.desired</c>.</summary>
internal sealed record ReleaseDto(string? Version);

/// <summary>A status condition (<c>type</c> + <c>"True"</c>/<c>"False"</c>/<c>"Unknown"</c>).</summary>
internal sealed record ConditionDto(string? Type, string? Status);

/// <summary>SelfSubjectAccessReview answer.</summary>
internal sealed record AccessReviewDto(AccessReviewStatusDto? Status);

/// <summary>SelfSubjectAccessReview <c>status</c>.</summary>
internal sealed record AccessReviewStatusDto(bool Allowed, string? Reason);

/// <summary>SelfSubjectRulesReview answer.</summary>
internal sealed record RulesReviewDto(RulesReviewStatusDto? Status);

/// <summary>SelfSubjectRulesReview <c>status</c>.</summary>
internal sealed record RulesReviewStatusDto(
    IReadOnlyList<ResourceRuleDto>? ResourceRules, bool Incomplete, string? EvaluationError);

/// <summary>One entry of <c>status.resourceRules</c>.</summary>
internal sealed record ResourceRuleDto(
    IReadOnlyList<string>? Verbs, IReadOnlyList<string>? ApiGroups, IReadOnlyList<string>? Resources, IReadOnlyList<string>? ResourceNames);
