using System.Diagnostics;
using System.Globalization;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using Microsoft.Extensions.Options;

namespace FleetConsole.Application.Credentials.ConnectionTesting;

/// <summary>
/// Runs a connection test (ADR-0011, TEST-1..4): the five steps against one cluster with one token, the capability
/// evaluation of <see cref="CapabilityCheckSet"/> and the grant-mode hints. Pure orchestration over the
/// <see cref="IClusterProbeClient"/> port, so it is unit-tested with a fake session; used by the <c>TestCredential</c>
/// and <c>TestToken</c> handlers, which do the loading, recording and auditing.
/// </summary>
/// <remarks>
/// <para><b>Steps</b> run in order and stop at the first failed one; the rest are reported as skipped. Warnings
/// (version not visible, identity unknown, rules not reviewable) don't stop the test.</para>
/// <para><b>Budget:</b> one <see cref="CredentialsOptions.ConnectionTestTimeout"/> over all steps, linked with the
/// caller's token. When the budget runs out the running step fails with <see cref="ProbeFailureKind.Timeout"/>; when the
/// caller cancels (request aborted) the <see cref="OperationCanceledException"/> propagates.</para>
/// <para>The token is only handed to the probe session; it never appears in a message, and probe failure messages
/// don't contain it.</para>
/// </remarks>
/// <param name="probes">Opens one probe session (own TLS handler) per test.</param>
/// <param name="clock">Supplies <see cref="ConnectionTestResultDto.TestedAt"/>.</param>
/// <param name="options">The test budget.</param>
internal sealed class ConnectionTester(IClusterProbeClient probes, IClock clock, IOptions<CredentialsOptions> options)
{
    /// <summary>Step message for <see cref="ProbeFailureKind.TlsUnknownAuthority"/> (contract §8.5).</summary>
    public const string UnknownAuthorityMessage = "Certificate signed by unknown authority — add the cluster CA bundle";

    /// <summary>Step message for a 401 (contract §8.5).</summary>
    public const string TokenRejectedMessage = "Token rejected by the cluster (expired, revoked, or for another cluster)";

    /// <summary>Warning message of <c>openShiftVersion</c> when the ClusterVersion is forbidden or absent (contract §8.5).</summary>
    public const string NotVisibleMessage = "Not visible with this credential";

    /// <summary>Message of a step that didn't run.</summary>
    public const string SkippedMessage = "Skipped because an earlier step failed.";

    // ADR-0011: the capability SSARs run concurrently, at most this many at a time.
    private const int MaxConcurrentReviews = 4;

    private static readonly ConnectionTestStep[] StepOrder =
    [
        ConnectionTestStep.Reachability,
        ConnectionTestStep.Authentication,
        ConnectionTestStep.Identity,
        ConnectionTestStep.OpenShiftVersion,
        ConnectionTestStep.Capabilities,
    ];

    /// <summary>Maps a cluster's stored connection settings to the probe port's input.</summary>
    /// <param name="cluster">The cluster.</param>
    /// <returns>The connection.</returns>
    public static ClusterConnection ConnectionOf(Cluster cluster)
    {
        ArgumentNullException.ThrowIfNull(cluster);
        return new ClusterConnection(cluster.Endpoint.Url, cluster.Endpoint.CaBundle?.Pem, cluster.Endpoint.SkipTlsVerify);
    }

    /// <summary>
    /// The summary of a result as stored on a credential and audited (TEST-5): the first failed step and the headline.
    /// Built from the same result, so <c>Succeeded</c> and <c>FailedStep</c> always agree (<c>Credential.RecordTest</c>
    /// checks that).
    /// </summary>
    /// <param name="result">A test result.</param>
    /// <returns>The summary.</returns>
    public static ConnectionTestSummary SummaryOf(ConnectionTestResultDto result)
    {
        ArgumentNullException.ThrowIfNull(result);
        var failed = result.Steps.FirstOrDefault(s => s.Status == ConnectionTestStepStatus.Failed);
        return new ConnectionTestSummary(result.TestedAt, failed is null, failed?.Step, result.Capabilities?.Headline);
    }

    /// <summary>Runs the test.</summary>
    /// <param name="connection">Where and how to connect.</param>
    /// <param name="token">The token to test; only handed to the probe session.</param>
    /// <param name="tokenMetadata">The token's JWT metadata; its subject is the identity fallback when the cluster has no
    /// SelfSubjectReview API.</param>
    /// <param name="inspectNamespace">A namespace to list the token's rules in, or <see langword="null"/>.</param>
    /// <param name="grants">The credential's grant counts for hints, or <see langword="null"/> for no grant hints.</param>
    /// <param name="cancellationToken">The caller's token (request aborted).</param>
    /// <returns>The result; a failed test is a normal result, not an exception.</returns>
    public async Task<ConnectionTestResultDto> RunAsync(
        ClusterConnection connection,
        SensitiveString token,
        TokenMetadata tokenMetadata,
        string? inspectNamespace,
        GrantModeCounts? grants,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(token);
        ArgumentNullException.ThrowIfNull(tokenMetadata);

        var testedAt = clock.UtcNow;
        var started = Stopwatch.GetTimestamp();
        var timeout = options.Value.ConnectionTestTimeout;
        var run = new TestRun();

        using var budget = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        budget.CancelAfter(timeout);

        var session = probes.Open(connection, token);
        await using (session.ConfigureAwait(false))
        {
            try
            {
                await RunStepsAsync(session, run, tokenMetadata, inspectNamespace, budget.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (budget.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
            {
                // Our budget ran out, not the caller's patience: the running step times out, the rest are skipped.
                run.Fail(
                    ProbeFailureKind.Timeout,
                    string.Create(CultureInfo.InvariantCulture, $"No answer within the test time limit of {timeout.TotalSeconds:0.#} seconds."));
            }
        }

        var steps = StepOrder
            .Select(step => run.Results.TryGetValue(step, out var result)
                ? result
                : new ConnectionTestStepResultDto(step, ConnectionTestStepStatus.Skipped, SkippedMessage, null))
            .ToList();

        return new ConnectionTestResultDto(
            Succeeded: steps.All(s => s.Status != ConnectionTestStepStatus.Failed),
            TestedAt: testedAt,
            DurationMs: (int)Math.Min(int.MaxValue, Stopwatch.GetElapsedTime(started).TotalMilliseconds),
            Steps: steps,
            KubernetesVersion: run.KubernetesVersion,
            Identity: run.Identity,
            OpenShiftVersion: run.OpenShiftVersion,
            Capabilities: run.Capabilities,
            NamespaceRules: run.NamespaceRules,
            Hints: HintsFor(run.Capabilities, grants));
    }

    private static async Task RunStepsAsync(
        IClusterProbeSession session, TestRun run, TokenMetadata tokenMetadata, string? inspectNamespace, CancellationToken ct)
    {
        if (!await CheckReachabilityAsync(session, run, ct).ConfigureAwait(false))
        {
            return;
        }

        var reviewedUsername = await CheckAuthenticationAsync(session, run, ct).ConfigureAwait(false);
        if (run.HasFailed)
        {
            return;
        }

        ResolveIdentity(run, reviewedUsername, tokenMetadata);

        if (!await CheckOpenShiftVersionAsync(session, run, ct).ConfigureAwait(false))
        {
            return;
        }

        await CheckCapabilitiesAsync(session, run, inspectNamespace, ct).ConfigureAwait(false);
    }

    // Step 1: GET /version. Network and TLS problems fail here. A 401/403 means the server answered (some clusters don't
    // show /version to every caller); whether the token is accepted is the next step's question.
    private static async Task<bool> CheckReachabilityAsync(IClusterProbeSession session, TestRun run, CancellationToken ct)
    {
        run.Begin(ConnectionTestStep.Reachability);
        var version = await session.GetVersionAsync(ct).ConfigureAwait(false);
        if (version.IsSuccess)
        {
            run.KubernetesVersion = version.Value.GitVersion;
            run.Pass($"Reachable, Kubernetes {version.Value.GitVersion}");
            return true;
        }

        if (version.Failure.Kind is ProbeFailureKind.Unauthorized or ProbeFailureKind.Forbidden)
        {
            run.Warn("Reachable; the Kubernetes version is not visible with this credential", version.Failure.Kind);
            return true;
        }

        run.Fail(version.Failure);
        return false;
    }

    // Step 2: SelfSubjectReview. 401 → rejected. 404 (API older than 1.28) or 403 (review not allowed — but then the token
    // was authenticated) → decide with the first capability SSAR instead (ADR-0011). Returns the reviewed username.
    private static async Task<string?> CheckAuthenticationAsync(IClusterProbeSession session, TestRun run, CancellationToken ct)
    {
        run.Begin(ConnectionTestStep.Authentication);
        var review = await session.GetSelfSubjectReviewAsync(ct).ConfigureAwait(false);
        if (review.IsSuccess)
        {
            run.Pass("Token accepted by the cluster");
            return string.IsNullOrWhiteSpace(review.Value.Username) ? null : review.Value.Username;
        }

        if (review.Failure.Kind is not (ProbeFailureKind.NotFound or ProbeFailureKind.Forbidden))
        {
            run.Fail(review.Failure);
            return null;
        }

        var access = await session.ReviewAccessAsync(CapabilityCheckSet.Checks[0].Attributes, ct).ConfigureAwait(false);
        if (access.IsSuccess)
        {
            run.Pass("Token accepted by the cluster (checked with an access review; SelfSubjectReview is not available)");
        }
        else
        {
            run.Fail(access.Failure);
        }

        return null;
    }

    // Step 3: never fails. The cluster's answer wins; the token's (unverified) subject is the fallback.
    private static void ResolveIdentity(TestRun run, string? reviewedUsername, TokenMetadata tokenMetadata)
    {
        run.Begin(ConnectionTestStep.Identity);
        if (reviewedUsername is not null)
        {
            run.Identity = new ClusterIdentityDto(reviewedUsername, IdentitySource.SelfSubjectReview);
            run.Pass($"Authenticated as {reviewedUsername}");
        }
        else if (tokenMetadata.Subject is { } subject)
        {
            run.Identity = new ClusterIdentityDto(subject, IdentitySource.TokenSubject);
            run.Pass($"Authenticated as {subject} (from the token; the cluster did not report the identity)");
        }
        else
        {
            run.Warn("Identity unknown: the cluster did not report it and the token does not name one", null);
        }
    }

    // Step 4: ClusterVersion. Not visible (403/404, e.g. plain Kubernetes or a namespaced SA) is a warning, not a failure.
    private static async Task<bool> CheckOpenShiftVersionAsync(IClusterProbeSession session, TestRun run, CancellationToken ct)
    {
        run.Begin(ConnectionTestStep.OpenShiftVersion);
        var version = await session.GetClusterVersionAsync(ct).ConfigureAwait(false);
        if (version.IsSuccess)
        {
            run.OpenShiftVersion = new OpenShiftVersionDto(version.Value.Version, version.Value.UpdateProgressing);
            run.Pass(version.Value.UpdateProgressing
                ? $"OpenShift {version.Value.Version} (update in progress)"
                : $"OpenShift {version.Value.Version}");
            return true;
        }

        if (version.Failure.Kind is ProbeFailureKind.Forbidden or ProbeFailureKind.NotFound)
        {
            run.Warn(NotVisibleMessage, version.Failure.Kind);
            return true;
        }

        run.Fail(version.Failure);
        return false;
    }

    // Step 5: the cluster-admin review plus every check, concurrently; then the optional rules review.
    private static async Task CheckCapabilitiesAsync(
        IClusterProbeSession session, TestRun run, string? inspectNamespace, CancellationToken ct)
    {
        run.Begin(ConnectionTestStep.Capabilities);
        var checks = CapabilityCheckSet.Checks;

        // Index 0 is the cluster-admin review, 1..n the checks; results land by index, so order is deterministic.
        var reviews = new[] { CapabilityCheckSet.ClusterAdmin }.Concat(checks.Select(c => c.Attributes)).ToArray();
        var responses = new ProbeResponse<AccessReviewResult>[reviews.Length];
        await Parallel.ForEachAsync(
            Enumerable.Range(0, reviews.Length),
            new ParallelOptions { MaxDegreeOfParallelism = MaxConcurrentReviews, CancellationToken = ct },
            async (index, token) => responses[index] = await session.ReviewAccessAsync(reviews[index], token).ConfigureAwait(false))
            .ConfigureAwait(false);

        if (responses.FirstOrDefault(r => !r.IsSuccess) is { Failure: { } failure })
        {
            run.Fail(failure);
            return;
        }

        var results = checks
            .Select((check, i) => new CapabilityCheckResultDto(check.Id, check.Label, check.Category, responses[i + 1].Value!.Allowed))
            .ToList();
        var headline = CapabilityCheckSet.Evaluate(results.ToDictionary(r => r.Id, r => r.Allowed), responses[0].Value!.Allowed);
        run.Capabilities = new CapabilitySummaryDto(headline, results);

        var summary = string.Create(
            CultureInfo.InvariantCulture,
            $"{HeadlineLabel(headline)}: {results.Count(r => r.Allowed)} of {results.Count} checks allowed");

        if (inspectNamespace is null)
        {
            run.Pass(summary);
            return;
        }

        var rules = await session.ReviewRulesAsync(inspectNamespace, ct).ConfigureAwait(false);
        if (!rules.IsSuccess)
        {
            run.Warn($"{summary}; the rules in namespace {inspectNamespace} could not be reviewed: {rules.Failure.Message}", rules.Failure.Kind);
            return;
        }

        run.NamespaceRules = new NamespaceRulesDto(
            inspectNamespace,
            rules.Value.Incomplete,
            rules.Value.EvaluationError,
            [.. rules.Value.Rules.Select(r => new ResourceRuleDto(r.Verbs, r.ApiGroups, r.Resources, r.ResourceNames))]);
        run.Pass(summary);
    }

    // TEST-4: only when the capabilities are known and the credential (hence its grants) is known.
    private static List<ConnectionTestHintDto> HintsFor(CapabilitySummaryDto? capabilities, GrantModeCounts? grants)
    {
        var hints = new List<ConnectionTestHintDto>();
        if (capabilities is null || grants is null)
        {
            return hints;
        }

        if (grants.ReadWrite > 0 && capabilities.Checks.Any(c => c.Category == CapabilityCategory.Write && !c.Allowed))
        {
            var users = grants.ReadWrite == 1 ? "1 user has" : string.Create(CultureInfo.InvariantCulture, $"{grants.ReadWrite} users have");
            hints.Add(new ConnectionTestHintDto(
                HintSeverity.Warning, $"{users} ReadWrite grants with this credential but it cannot modify workloads"));
        }

        if (capabilities.Headline == CapabilityLevel.ClusterAdmin && grants.ReadOnly > 0)
        {
            hints.Add(new ConnectionTestHintDto(
                HintSeverity.Info, "This credential is cluster-admin; ReadOnly grants rely on FleetConsole's read-only guard"));
        }

        return hints;
    }

    private static string HeadlineLabel(CapabilityLevel headline) => headline switch
    {
        CapabilityLevel.ClusterAdmin => "Cluster-admin",
        CapabilityLevel.ClusterWideEdit => "Cluster-wide edit",
        CapabilityLevel.ClusterWideView => "Cluster-wide view",
        _ => "Limited",
    };

    // Failure → step message: the contract's texts for the kinds the UI explains (§8.5), else the probe's own message
    // (already human-readable and free of the token).
    private static string MessageFor(ProbeFailure failure) => failure.Kind switch
    {
        ProbeFailureKind.TlsUnknownAuthority => UnknownAuthorityMessage,
        ProbeFailureKind.Unauthorized => TokenRejectedMessage,
        _ => failure.Message,
    };

    /// <summary>The step results collected so far and what the steps learned. Single-threaded: steps run in order.</summary>
    private sealed class TestRun
    {
        private ConnectionTestStep? _current;

        public Dictionary<ConnectionTestStep, ConnectionTestStepResultDto> Results { get; } = [];

        public bool HasFailed => Results.Values.Any(r => r.Status == ConnectionTestStepStatus.Failed);

        public string? KubernetesVersion { get; set; }

        public ClusterIdentityDto? Identity { get; set; }

        public OpenShiftVersionDto? OpenShiftVersion { get; set; }

        public CapabilitySummaryDto? Capabilities { get; set; }

        public NamespaceRulesDto? NamespaceRules { get; set; }

        public void Begin(ConnectionTestStep step) => _current = step;

        public void Pass(string message) => Complete(ConnectionTestStepStatus.Passed, message, null);

        public void Warn(string message, ProbeFailureKind? kind) => Complete(ConnectionTestStepStatus.Warning, message, kind);

        public void Fail(ProbeFailure failure) => Fail(failure.Kind, MessageFor(failure));

        // Also used for the budget timeout, which can strike while a step is running (overwrites nothing: the running
        // step has no result yet) or, in theory, between steps (then the next step in order is the one that timed out).
        public void Fail(ProbeFailureKind kind, string message)
        {
            if (_current is not { } step || Results.ContainsKey(step))
            {
                step = StepOrder.First(s => !Results.ContainsKey(s));
                _current = step;
            }

            Complete(ConnectionTestStepStatus.Failed, message, kind);
        }

        private void Complete(ConnectionTestStepStatus status, string message, ProbeFailureKind? kind)
        {
            var step = _current ?? throw new InvalidOperationException("No step is running.");
            Results[step] = new ConnectionTestStepResultDto(step, status, message, kind);
        }
    }
}
