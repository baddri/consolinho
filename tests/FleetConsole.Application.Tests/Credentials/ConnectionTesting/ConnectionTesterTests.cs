using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Credentials;
using FleetConsole.Application.Credentials.ConnectionTesting;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Domain.Clusters;
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
    private static readonly ConnectionTestTarget OpenShiftTarget = new(Connection, ClusterDistribution.OpenShift);
    private static readonly string[] KubernetesGroups = ["apps", "batch", "networking.k8s.io"];
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
            ConnectionTestStep.Distribution, ConnectionTestStep.OpenShiftVersion, ConnectionTestStep.Capabilities,
        ]);
        result.Steps.ShouldAllBe(s => s.Status == ConnectionTestStepStatus.Passed && s.FailureKind == null);
        result.Steps[0].Message.ShouldBe("Reachable, Kubernetes v1.31.4");
        result.KubernetesVersion.ShouldBe("v1.31.4");
        result.Identity.ShouldBe(new ClusterIdentityDto("system:serviceaccount:fleet:viewer", IdentitySource.SelfSubjectReview));
        result.OpenShiftVersion.ShouldBe(new OpenShiftVersionDto("4.17.3", false));
        result.DetectedDistribution.ShouldBe(ClusterDistribution.OpenShift);
        result.Steps[3].Message.ShouldBe(ConnectionTester.OpenShiftAsRegisteredMessage);
        result.Capabilities.ShouldNotBeNull().Checks.Select(c => c.Id).ShouldBe(CapabilityCheckSet.Checks.Select(c => c.Id));
        result.NamespaceRules.ShouldBeEmpty();
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
        result.Steps[5].Message.ShouldStartWith("Cluster-admin");
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
        result.Steps[5].Message.ShouldBe("Cluster-wide view: 3 of 12 checks allowed");
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
        result.Steps[4].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.OpenShiftVersion, ConnectionTestStepStatus.Warning, ConnectionTester.NotVisibleMessage, kind));
        result.OpenShiftVersion.ShouldBeNull();
        result.Steps[5].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        ConnectionTester.SummaryOf(result).Succeeded.ShouldBeTrue();
    }

    [Fact]
    public async Task Kubernetes_declared_but_OpenShift_served_warns_and_still_reads_ClusterVersion()
    {
        var result = await RunAsync(distribution: ClusterDistribution.Kubernetes);

        result.Succeeded.ShouldBeTrue();
        result.Steps[3].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.Distribution, ConnectionTestStepStatus.Warning,
            "The cluster serves OpenShift APIs but is registered as Kubernetes. Check the distribution.", null));
        result.DetectedDistribution.ShouldBe(ClusterDistribution.OpenShift);
        result.Steps[4].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        result.OpenShiftVersion.ShouldNotBeNull();
        _probes.ClusterVersionCalls.ShouldBe(1);
        ConnectionTester.SummaryOf(result).Succeeded.ShouldBeTrue();
        // Detection, not declaration, decides which checks apply.
        result.Capabilities.ShouldNotBeNull().Checks.Select(c => c.Id).ShouldContain("list-clusteroperators");
    }

    [Fact]
    public async Task OpenShift_declared_but_not_served_warns_and_ClusterVersion_behaves_as_before()
    {
        _probes.ApiGroups = _ => FakeProbeClient.Ok(new ServedApiGroups(KubernetesGroups));
        _probes.ClusterVersion = _ => FakeProbeClient.Fail<ClusterVersionInfo>(ProbeFailureKind.NotFound);

        var result = await RunAsync();

        result.Succeeded.ShouldBeTrue();
        result.Steps[3].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.Distribution, ConnectionTestStepStatus.Warning,
            "The cluster does not serve OpenShift APIs but is registered as OpenShift. Check the distribution.", null));
        result.DetectedDistribution.ShouldBe(ClusterDistribution.Kubernetes);
        result.Steps[4].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.OpenShiftVersion, ConnectionTestStepStatus.Warning, ConnectionTester.NotVisibleMessage, ProbeFailureKind.NotFound));
        _probes.ClusterVersionCalls.ShouldBe(1);
    }

    [Fact]
    public async Task Kubernetes_declared_and_not_served_passes_and_skips_ClusterVersion_without_calling_it()
    {
        _probes.ApiGroups = _ => FakeProbeClient.Ok(new ServedApiGroups(KubernetesGroups));

        var result = await RunAsync(distribution: ClusterDistribution.Kubernetes);

        result.Succeeded.ShouldBeTrue();
        result.Steps[3].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.Distribution, ConnectionTestStepStatus.Passed, ConnectionTester.KubernetesAsRegisteredMessage, null));
        result.DetectedDistribution.ShouldBe(ClusterDistribution.Kubernetes);
        result.Steps[4].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.OpenShiftVersion, ConnectionTestStepStatus.Skipped, "Not an OpenShift cluster", null));
        result.OpenShiftVersion.ShouldBeNull();
        result.Steps[5].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        _probes.ClusterVersionCalls.ShouldBe(0);
        ConnectionTester.SummaryOf(result).Succeeded.ShouldBeTrue();
        // CT-1: the OpenShift-only check is omitted, and no review is sent for it.
        result.Capabilities.ShouldNotBeNull().Checks.Select(c => c.Id).ShouldBe(
            CapabilityCheckSet.Checks.Select(c => c.Id).Where(id => id != "list-clusteroperators"));
        _probes.ReviewedAttributes.ShouldNotContain(Check("list-clusteroperators"));
        _probes.ReviewedAttributes.Count.ShouldBe(CapabilityCheckSet.Checks.Count);
    }

    [Theory]
    [InlineData(ClusterDistribution.OpenShift, 1)]
    [InlineData(ClusterDistribution.Kubernetes, 0)]
    public async Task Discovery_not_visible_warns_with_the_probe_kind_and_the_test_continues(ClusterDistribution declared, int clusterVersionCalls)
    {
        _probes.ApiGroups = _ => FakeProbeClient.Fail<ServedApiGroups>(ProbeFailureKind.Forbidden);

        var result = await RunAsync(distribution: declared);

        result.Succeeded.ShouldBeTrue();
        result.Steps[3].ShouldBe(new ConnectionTestStepResultDto(
            ConnectionTestStep.Distribution, ConnectionTestStepStatus.Warning, ConnectionTester.DiscoveryNotVisibleMessage, ProbeFailureKind.Forbidden));
        result.DetectedDistribution.ShouldBeNull();
        result.Steps[5].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        _probes.ClusterVersionCalls.ShouldBe(clusterVersionCalls);
        // Unreadable discovery never guesses: every check is kept.
        result.Capabilities.ShouldNotBeNull().Checks.Select(c => c.Id).ShouldBe(CapabilityCheckSet.Checks.Select(c => c.Id));
    }

    [Fact]
    public async Task Failure_before_discovery_reports_distribution_as_skipped()
    {
        _probes.Version = _ => FakeProbeClient.Fail<KubernetesVersionInfo>(ProbeFailureKind.ConnectionRefused);

        var result = await RunAsync();

        result.Succeeded.ShouldBeFalse();
        result.Steps.Count.ShouldBe(6);
        result.Steps[3].Step.ShouldBe(ConnectionTestStep.Distribution);
        result.Steps[3].Status.ShouldBe(ConnectionTestStepStatus.Skipped);
        result.DetectedDistribution.ShouldBeNull();
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
        result.Steps[5].ShouldBe(new ConnectionTestStepResultDto(
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
        result.Steps[4].Status.ShouldBe(ConnectionTestStepStatus.Failed);
        result.Steps[4].FailureKind.ShouldBe(ProbeFailureKind.Timeout);
        result.Steps[5].Status.ShouldBe(ConnectionTestStepStatus.Skipped);
        _probes.SessionDisposed.ShouldBeTrue();
    }

    [Fact]
    public async Task Caller_cancellation_propagates()
    {
        _probes.Version = FakeProbeClient.Hang<KubernetesVersionInfo>;
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        cts.CancelAfter(TimeSpan.FromMilliseconds(50));

        await Should.ThrowAsync<OperationCanceledException>(() => Tester(TimeSpan.FromMinutes(1))
            .RunAsync(OpenShiftTarget, new SensitiveString("fake-token"), JwtMetadata, InspectNamespaces.Empty, null, cts.Token));
    }

    [Fact]
    public async Task Namespace_rules_only_when_requested()
    {
        var without = await RunAsync();
        var with = await RunAsync(namespaces: ["team-a"]);

        without.NamespaceRules.ShouldBeEmpty();
        var rules = with.NamespaceRules.ShouldHaveSingleItem();
        rules.Namespace.ShouldBe("team-a");
        rules.Rules.ShouldNotBeNull().ShouldHaveSingleItem().Resources.ShouldBe(["pods"]);
        rules.Error.ShouldBeNull();
        rules.FailureKind.ShouldBeNull();
        with.Steps[5].Status.ShouldBe(ConnectionTestStepStatus.Passed);
        with.Steps[5].Message.ShouldBe(without.Steps[5].Message);
    }

    [Fact]
    public async Task Rules_review_failure_is_an_entry_and_a_capabilities_warning()
    {
        _probes.RulesReview = (_, _) => FakeProbeClient.Fail<RulesReviewResult>(ProbeFailureKind.Forbidden, "forbidden");

        var result = await RunAsync(namespaces: ["team-a"]);

        result.Succeeded.ShouldBeTrue();
        result.Steps[5].Status.ShouldBe(ConnectionTestStepStatus.Warning);
        result.Steps[5].Message.ShouldEndWith("; rules reviewed in 0 of 1 namespaces");
        result.Steps[5].FailureKind.ShouldBe(ProbeFailureKind.Forbidden);
        result.Capabilities.ShouldNotBeNull();
        var entry = result.NamespaceRules.ShouldHaveSingleItem();
        entry.Rules.ShouldBeNull();
        entry.Error.ShouldBe("forbidden");
        entry.FailureKind.ShouldBe(ProbeFailureKind.Forbidden);
        entry.Incomplete.ShouldBeFalse();
    }

    [Fact]
    public async Task Rejected_token_in_one_namespace_gets_the_token_rejected_text()
    {
        _probes.RulesReview = (ns, _) => ns == "team-b"
            ? FakeProbeClient.Fail<RulesReviewResult>(ProbeFailureKind.Unauthorized, "raw probe text")
            : FakeProbeClient.Ok(new RulesReviewResult(false, null, []));

        var result = await RunAsync(namespaces: ["team-a", "team-b"]);

        result.Succeeded.ShouldBeTrue();
        result.NamespaceRules[0].Error.ShouldBeNull();
        result.NamespaceRules[1].Error.ShouldBe(ConnectionTester.TokenRejectedMessage);
        result.NamespaceRules[1].FailureKind.ShouldBe(ProbeFailureKind.Unauthorized);
        result.Steps[5].Message.ShouldEndWith("; rules reviewed in 1 of 2 namespaces");
        result.Steps[5].FailureKind.ShouldBe(ProbeFailureKind.Unauthorized);
    }

    [Fact]
    public async Task Several_namespaces_one_forbidden_one_hanging_until_the_budget_keep_order_and_warn()
    {
        _probes.RulesReview = (ns, ct) => ns switch
        {
            "team-b" => FakeProbeClient.Fail<RulesReviewResult>(ProbeFailureKind.Forbidden, "namespaces \"team-b\" is forbidden"),
            "team-c" => FakeProbeClient.Hang<RulesReviewResult>(ct),
            _ => FakeProbeClient.Ok(new RulesReviewResult(true, "webhook authorizer", [])),
        };

        var result = await RunAsync(namespaces: ["team-a", "team-b", "team-c"], timeout: TimeSpan.FromMilliseconds(300));

        result.Succeeded.ShouldBeTrue();
        result.NamespaceRules.Select(r => r.Namespace).ShouldBe(["team-a", "team-b", "team-c"]);
        result.NamespaceRules[0].Rules.ShouldNotBeNull().ShouldBeEmpty();
        result.NamespaceRules[0].Incomplete.ShouldBeTrue();
        result.NamespaceRules[0].EvaluationError.ShouldBe("webhook authorizer");
        result.NamespaceRules[1].ShouldSatisfyAllConditions(
            r => r.Rules.ShouldBeNull(),
            r => r.Error.ShouldBe("namespaces \"team-b\" is forbidden"),
            r => r.FailureKind.ShouldBe(ProbeFailureKind.Forbidden));
        result.NamespaceRules[2].ShouldSatisfyAllConditions(
            r => r.Rules.ShouldBeNull(),
            r => r.Error.ShouldBe(ConnectionTester.RulesTimeoutMessage),
            r => r.FailureKind.ShouldBe(ProbeFailureKind.Timeout));
        var step = result.Steps[5];
        step.Status.ShouldBe(ConnectionTestStepStatus.Warning);
        step.Message.ShouldMatch(@"^Limited: 0 of \d+ checks allowed; rules reviewed in 1 of 3 namespaces$");
        step.FailureKind.ShouldBe(ProbeFailureKind.Forbidden);
    }

    [Fact]
    public async Task Rules_reviews_are_bounded_to_four_in_flight()
    {
        var inFlight = 0;
        var maxInFlight = 0;
        _probes.RulesReview = async (_, ct) =>
        {
            var now = Interlocked.Increment(ref inFlight);
            InterlockedMax(ref maxInFlight, now);
            await Task.Delay(20, ct);
            Interlocked.Decrement(ref inFlight);
            return ProbeResponse<RulesReviewResult>.Ok(new RulesReviewResult(false, null, []));
        };

        var result = await RunAsync(namespaces: [.. Enumerable.Range(0, 10).Select(i => $"ns-{i}")]);

        result.NamespaceRules.Count.ShouldBe(10);
        result.NamespaceRules.ShouldAllBe(r => r.Error == null);
        maxInFlight.ShouldBe(4);
        result.Steps[5].Status.ShouldBe(ConnectionTestStepStatus.Passed);
    }

    [Fact]
    public async Task Caller_cancellation_during_rules_reviews_propagates()
    {
        _probes.RulesReview = (_, ct) => FakeProbeClient.Hang<RulesReviewResult>(ct);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        cts.CancelAfter(TimeSpan.FromMilliseconds(100));

        await Should.ThrowAsync<OperationCanceledException>(() => Tester(TimeSpan.FromMinutes(1))
            .RunAsync(OpenShiftTarget, new SensitiveString("fake-token"), JwtMetadata, Namespaces("team-a", "team-b"), null, cts.Token));
    }

    [Fact]
    public void Namespace_rules_entries_hold_exactly_one_of_rules_and_error()
    {
        var reviewed = NamespaceRulesDto.Reviewed("team-a", false, null, []);
        var failed = NamespaceRulesDto.Failed("team-a", ProbeFailureKind.NotFound, "not found");

        reviewed.ShouldSatisfyAllConditions(r => r.Rules.ShouldNotBeNull(), r => r.Error.ShouldBeNull(), r => r.FailureKind.ShouldBeNull());
        failed.ShouldSatisfyAllConditions(
            r => r.Rules.ShouldBeNull(), r => r.Error.ShouldBe("not found"), r => r.FailureKind.ShouldBe(ProbeFailureKind.NotFound));
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
            HintSeverity.Info, "This credential is cluster-admin; ReadOnly grants rely on Consolinho's read-only guard")]);
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

    private static InspectNamespaces Namespaces(params string[] names) => InspectNamespaces.Create(names).Value;

    private static void InterlockedMax(ref int target, int value)
    {
        int seen;
        while (value > (seen = Volatile.Read(ref target)) && Interlocked.CompareExchange(ref target, value, seen) != seen)
        {
        }
    }

    private Task<ConnectionTestResultDto> RunAsync(
        TokenMetadata? metadata = null, string[]? namespaces = null, GrantModeCounts? grants = null, TimeSpan? timeout = null,
        ClusterDistribution distribution = ClusterDistribution.OpenShift) =>
        Tester(timeout ?? TimeSpan.FromSeconds(30)).RunAsync(
            new ConnectionTestTarget(Connection, distribution), new SensitiveString("fake-token"), metadata ?? JwtMetadata,
            Namespaces(namespaces ?? []), grants, Ct);
}
