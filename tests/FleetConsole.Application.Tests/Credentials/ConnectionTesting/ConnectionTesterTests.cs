using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Credentials;
using FleetConsole.Application.Credentials.ConnectionTesting;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Domain.Credentials;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Tests.Credentials.ConnectionTesting;

/// <summary>
/// <see cref="ConnectionTester"/> over a scripted probe session (ADR-0011): headline levels, stop/skip rules, the
/// authentication and identity fallbacks, warnings that are not failures, the time budget, namespace rules and the
/// TEST-4 hints.
/// </summary>
public sealed class ConnectionTesterTests
{
    private static readonly ClusterConnection Connection = new(new Uri("https://api.prod-eu-1.example.com:6443"), null, false);
    private static readonly TokenMetadata JwtMetadata = new(TokenType.Jwt, "system:serviceaccount:fleet:from-token", null, null);

    private readonly FakeProbeClient _probes = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static ResourceAttributes Check(string id) => CapabilityCheckSet.Checks.Single(c => c.Id == id).Attributes;

    [Fact]
    public async Task Healthy_cluster_passes_all_steps_with_versions_identity_and_checks()
    {
        var result = await RunAsync();

        result.Succeeded.ShouldBeTrue();
        result.TestedAt.ShouldBe(FixedClock.Now);
        result.Steps.Select(s => s.Step).ShouldBe(
        [
            ConnectionTestStep.Reachability, ConnectionTestStep.Authentication, ConnectionTestStep.Identity,
            ConnectionTestStep.OpenShiftVersion, ConnectionTestStep.Capabilities,
        ]);
        result.Steps.ShouldAllBe(s => s.Status == ConnectionTestStepStatus.Passed && s.FailureKind == null);
        result.Steps[0].Message.ShouldBe("Reachable, Kubernetes v1.31.4");
        result.KubernetesVersion.ShouldBe("v1.31.4");
        result.Identity.ShouldBe(new ClusterIdentityDto("system:serviceaccount:fleet:viewer", IdentitySource.SelfSubjectReview));
        result.OpenShiftVersion.ShouldBe(new OpenShiftVersionDto("4.17.3", false));
        result.Capabilities.ShouldNotBeNull().Checks.Select(c => c.Id).ShouldBe(CapabilityCheckSet.Checks.Select(c => c.Id));
        result.NamespaceRules.ShouldBeNull();
        result.Hints.ShouldBeEmpty();
        _probes.SessionDisposed.ShouldBeTrue();
        _probes.ReviewedAttributes.ShouldContain(CapabilityCheckSet.ClusterAdmin);
        _probes.ReviewedAttributes.ShouldAllBe(a => a.Namespace == null);
    }

    [Fact]
    public async Task Headline_cluster_admin_when_star_review_allowed()
    {
        _probes.Allow(CapabilityCheckSet.ClusterAdmin);

        var result = await RunAsync();

        result.Capabilities.ShouldNotBeNull().Headline.ShouldBe(CapabilityLevel.ClusterAdmin);
        result.Steps[4].Message.ShouldStartWith("Cluster-admin");
    }

    [Fact]
    public async Task Headline_cluster_wide_edit_needs_patch_delete_update()
    {
        _probes.Allow(Check("patch-deployments"), Check("delete-pods"), Check("update-configmaps"));

        (await RunAsync()).Capabilities.ShouldNotBeNull().Headline.ShouldBe(CapabilityLevel.ClusterWideEdit);
    }

    [Fact]
    public async Task Headline_cluster_wide_view_needs_list_pods_deployments_namespaces()
    {
        _probes.Allow(Check("list-pods"), Check("list-deployments"), Check("list-namespaces"));

        var result = await RunAsync();

        var capabilities = result.Capabilities.ShouldNotBeNull();
        capabilities.Headline.ShouldBe(CapabilityLevel.ClusterWideView);
        capabilities.Checks.Where(c => c.Allowed).Select(c => c.Id).ShouldBe(["list-pods", "list-deployments", "list-namespaces"]);
        result.Steps[4].Message.ShouldBe("Cluster-wide view: 3 of 12 checks allowed");
    }

    [Fact]
    public async Task Headline_limited_when_a_view_check_is_missing()
    {
        _probes.Allow(Check("list-pods"), Check("list-deployments"));

        (await RunAsync()).Capabilities.ShouldNotBeNull().Headline.ShouldBe(CapabilityLevel.Limited);
    }

    [Fact]
    public async Task Unknown_authority_fails_reachability_with_contract_text_and_skips_the_rest()
    {
        _probes.Version = _ => FakeProbeClient.Fail<KubernetesVersionInfo>(ProbeFailureKind.TlsUnknownAuthority);

        var result = await RunAsync();

        result.Succeeded.ShouldBeFalse();
        result.Steps[0].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.Reachability, ConnectionTestStepStatus.Failed, ConnectionTester.UnknownAuthorityMessage,
            ProbeFailureKind.TlsUnknownAuthority));
        result.Steps.Skip(1).ShouldAllBe(s => s.Status == ConnectionTestStepStatus.Skipped && s.Message == ConnectionTester.SkippedMessage);
        result.KubernetesVersion.ShouldBeNull();
        result.Capabilities.ShouldBeNull();
        ConnectionTester.SummaryOf(result).ShouldBe(new ConnectionTestSummary(FixedClock.Now, false, ConnectionTestStep.Reachability, null));
    }

    [Fact]
    public async Task Other_network_failures_use_the_probe_message()
    {
        _probes.Version = _ => FakeProbeClient.Fail<KubernetesVersionInfo>(ProbeFailureKind.DnsFailure, "Host not found.");

        var step = (await RunAsync()).Steps[0];

        step.Status.ShouldBe(ConnectionTestStepStatus.Failed);
        step.Message.ShouldBe("Host not found.");
        step.FailureKind.ShouldBe(ProbeFailureKind.DnsFailure);
    }

    [Fact]
    public async Task Unauthorized_fails_authentication_and_skips_later_steps()
    {
        _probes.SelfSubjectReview = _ => FakeProbeClient.Fail<SelfSubjectReviewInfo>(ProbeFailureKind.Unauthorized);

        var result = await RunAsync();

        result.Succeeded.ShouldBeFalse();
        result.Steps[0].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        result.Steps[1].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.Authentication, ConnectionTestStepStatus.Failed, ConnectionTester.TokenRejectedMessage,
            ProbeFailureKind.Unauthorized));
        result.Steps.Skip(2).ShouldAllBe(s => s.Status == ConnectionTestStepStatus.Skipped);
        result.Identity.ShouldBeNull();
        _probes.ReviewedAttributes.ShouldBeEmpty();
    }

    [Fact]
    public async Task Version_hidden_from_the_token_is_a_warning_and_authentication_decides()
    {
        _probes.Version = _ => FakeProbeClient.Fail<KubernetesVersionInfo>(ProbeFailureKind.Forbidden);

        var result = await RunAsync();

        result.Succeeded.ShouldBeTrue();
        result.Steps[0].Status.ShouldBe(ConnectionTestStepStatus.Warning);
        result.Steps[0].FailureKind.ShouldBe(ProbeFailureKind.Forbidden);
        result.KubernetesVersion.ShouldBeNull();
    }

    [Theory]
    [InlineData(ProbeFailureKind.Forbidden)]
    [InlineData(ProbeFailureKind.NotFound)]
    public async Task ClusterVersion_not_visible_is_a_warning_not_a_failure(ProbeFailureKind kind)
    {
        _probes.ClusterVersion = _ => FakeProbeClient.Fail<ClusterVersionInfo>(kind);

        var result = await RunAsync();

        result.Succeeded.ShouldBeTrue();
        result.Steps[3].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.OpenShiftVersion, ConnectionTestStepStatus.Warning, ConnectionTester.NotVisibleMessage, kind));
        result.OpenShiftVersion.ShouldBeNull();
        result.Steps[4].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        ConnectionTester.SummaryOf(result).Succeeded.ShouldBeTrue();
    }

    [Fact]
    public async Task SelfSubjectReview_404_authenticates_with_an_access_review_and_takes_identity_from_the_token()
    {
        _probes.SelfSubjectReview = _ => FakeProbeClient.Fail<SelfSubjectReviewInfo>(ProbeFailureKind.NotFound);

        var result = await RunAsync();

        result.Succeeded.ShouldBeTrue();
        result.Steps[1].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        result.Steps[1].Message.ShouldContain("access review");
        result.Identity.ShouldBe(new ClusterIdentityDto("system:serviceaccount:fleet:from-token", IdentitySource.TokenSubject));
        result.Steps[2].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        _probes.ReviewedAttributes[0].ShouldBe(CapabilityCheckSet.Checks[0].Attributes);
    }

    [Fact]
    public async Task SelfSubjectReview_403_is_treated_like_404_access_review_and_token_subject()
    {
        // ADR-0011 amendment (T-0050): a token that may not create a SelfSubjectReview was still authenticated, so the
        // step falls back to an access review exactly as for a cluster without the API.
        _probes.SelfSubjectReview = _ => FakeProbeClient.Fail<SelfSubjectReviewInfo>(ProbeFailureKind.Forbidden);

        var result = await RunAsync();

        result.Succeeded.ShouldBeTrue();
        result.Steps[1].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        result.Steps[1].Message.ShouldContain("access review");
        result.Identity.ShouldBe(new ClusterIdentityDto("system:serviceaccount:fleet:from-token", IdentitySource.TokenSubject));
        result.Steps[2].Status.ShouldBe(ConnectionTestStepStatus.Passed);
    }

    [Fact]
    public async Task SelfSubjectReview_404_and_rejected_access_review_fails_authentication()
    {
        _probes.SelfSubjectReview = _ => FakeProbeClient.Fail<SelfSubjectReviewInfo>(ProbeFailureKind.NotFound);
        _probes.DefaultReview = ProbeResponse<AccessReviewResult>.Fail(new ProbeFailure(ProbeFailureKind.Unauthorized, "401"));

        var result = await RunAsync();

        result.Steps[1].Status.ShouldBe(ConnectionTestStepStatus.Failed);
        result.Steps[1].Message.ShouldBe(ConnectionTester.TokenRejectedMessage);
    }

    [Fact]
    public async Task No_identity_anywhere_is_a_warning()
    {
        _probes.SelfSubjectReview = _ => FakeProbeClient.Fail<SelfSubjectReviewInfo>(ProbeFailureKind.NotFound);

        var result = await RunAsync(metadata: TokenMetadata.Opaque);

        result.Succeeded.ShouldBeTrue();
        result.Steps[2].Status.ShouldBe(ConnectionTestStepStatus.Warning);
        result.Identity.ShouldBeNull();
    }

    [Fact]
    public async Task Failed_access_review_fails_capabilities_without_headline()
    {
        _probes.AnswerReview(Check("list-nodes"), ProbeResponse<AccessReviewResult>.Fail(new ProbeFailure(ProbeFailureKind.UnexpectedStatus, "HTTP 500")));

        var result = await RunAsync();

        result.Succeeded.ShouldBeFalse();
        result.Steps[4].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.Capabilities, ConnectionTestStepStatus.Failed, "HTTP 500", ProbeFailureKind.UnexpectedStatus));
        result.Capabilities.ShouldBeNull();
        ConnectionTester.SummaryOf(result).ShouldBe(new ConnectionTestSummary(FixedClock.Now, false, ConnectionTestStep.Capabilities, null));
    }

    [Fact]
    public async Task Timeout_fails_the_running_step_and_skips_the_rest()
    {
        _probes.ClusterVersion = FakeProbeClient.Hang<ClusterVersionInfo>;

        var result = await RunAsync(timeout: TimeSpan.FromMilliseconds(100));

        result.Succeeded.ShouldBeFalse();
        result.Steps[2].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        result.Steps[3].Status.ShouldBe(ConnectionTestStepStatus.Failed);
        result.Steps[3].FailureKind.ShouldBe(ProbeFailureKind.Timeout);
        result.Steps[4].Status.ShouldBe(ConnectionTestStepStatus.Skipped);
        _probes.SessionDisposed.ShouldBeTrue();
    }

    [Fact]
    public async Task Caller_cancellation_propagates()
    {
        _probes.Version = FakeProbeClient.Hang<KubernetesVersionInfo>;
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        cts.CancelAfter(TimeSpan.FromMilliseconds(50));

        await Should.ThrowAsync<OperationCanceledException>(() => Tester(TimeSpan.FromMinutes(1))
            .RunAsync(Connection, new SensitiveString("fake-token"), JwtMetadata, null, null, cts.Token));
    }

    [Fact]
    public async Task Namespace_rules_only_when_requested()
    {
        var without = await RunAsync();
        var with = await RunAsync(inspectNamespace: "team-a");

        without.NamespaceRules.ShouldBeNull();
        var rules = with.NamespaceRules.ShouldNotBeNull();
        rules.Namespace.ShouldBe("team-a");
        rules.Rules.ShouldHaveSingleItem().Resources.ShouldBe(["pods"]);
        with.Steps[4].Status.ShouldBe(ConnectionTestStepStatus.Passed);
    }

    [Fact]
    public async Task Rules_review_failure_is_a_capabilities_warning()
    {
        _probes.RulesReview = (_, _) => FakeProbeClient.Fail<RulesReviewResult>(ProbeFailureKind.Forbidden, "forbidden");

        var result = await RunAsync(inspectNamespace: "team-a");

        result.Succeeded.ShouldBeTrue();
        result.Steps[4].Status.ShouldBe(ConnectionTestStepStatus.Warning);
        result.Capabilities.ShouldNotBeNull();
        result.NamespaceRules.ShouldBeNull();
    }

    [Fact]
    public async Task Hint_when_read_write_grants_but_no_write_access()
    {
        _probes.Allow(Check("list-pods"), Check("list-deployments"), Check("list-namespaces"));

        var result = await RunAsync(grants: new GrantModeCounts(ReadOnly: 1, ReadWrite: 3));

        result.Hints.ShouldBe([new ConnectionTestHintDto(
            HintSeverity.Warning, "3 users have ReadWrite grants with this credential but it cannot modify workloads")]);
    }

    [Fact]
    public async Task Hint_when_cluster_admin_with_read_only_grants()
    {
        _probes.Allow(CapabilityCheckSet.ClusterAdmin);
        _probes.DefaultReview = ProbeResponse<AccessReviewResult>.Ok(new AccessReviewResult(true, null));

        var result = await RunAsync(grants: new GrantModeCounts(ReadOnly: 2, ReadWrite: 1));

        result.Hints.ShouldBe([new ConnectionTestHintDto(
            HintSeverity.Info, "This credential is cluster-admin; ReadOnly grants rely on FleetConsole's read-only guard")]);
    }

    [Fact]
    public async Task No_grant_hints_without_grant_counts()
    {
        _probes.Allow(CapabilityCheckSet.ClusterAdmin);

        (await RunAsync(grants: null)).Hints.ShouldBeEmpty();
    }

    [Fact]
    public void Evaluate_treats_missing_ids_as_denied()
    {
        CapabilityCheckSet.Evaluate(new Dictionary<string, bool>(), clusterAdmin: false).ShouldBe(CapabilityLevel.Limited);
        CapabilityCheckSet.Checks.Select(c => c.Id).ShouldBeUnique();
    }

    private ConnectionTester Tester(TimeSpan timeout) =>
        new(_probes, new FixedClock(), Options.Create(new CredentialsOptions { ConnectionTestTimeout = timeout }));

    private Task<ConnectionTestResultDto> RunAsync(
        TokenMetadata? metadata = null, string? inspectNamespace = null, GrantModeCounts? grants = null, TimeSpan? timeout = null) =>
        Tester(timeout ?? TimeSpan.FromSeconds(30))
            .RunAsync(Connection, new SensitiveString("fake-token"), metadata ?? JwtMetadata, inspectNamespace, grants, Ct);
}
