using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Application.Tests.Credentials.ConnectionTesting;

/// <summary>
/// A scripted probe client for <c>ConnectionTester</c> tests. Defaults describe a healthy OpenShift cluster where the
/// token may do nothing (all access reviews denied); tests change one answer at a time.
/// </summary>
internal sealed class FakeProbeClient : IClusterProbeClient
{
    private readonly Dictionary<ResourceAttributes, ProbeResponse<AccessReviewResult>> _reviews = [];

    public Func<CancellationToken, Task<ProbeResponse<KubernetesVersionInfo>>> Version { get; set; } =
        _ => Ok(new KubernetesVersionInfo("v1.31.4"));

    public Func<CancellationToken, Task<ProbeResponse<SelfSubjectReviewInfo>>> SelfSubjectReview { get; set; } =
        _ => Ok(new SelfSubjectReviewInfo("system:serviceaccount:fleet:viewer", ["system:authenticated"]));

    public Func<CancellationToken, Task<ProbeResponse<ClusterVersionInfo>>> ClusterVersion { get; set; } =
        _ => Ok(new ClusterVersionInfo("4.17.3", false));

    public Func<string, CancellationToken, Task<ProbeResponse<RulesReviewResult>>> RulesReview { get; set; } =
        (_, _) => Ok(new RulesReviewResult(false, null, [new KubernetesResourceRule(["get", "list"], [""], ["pods"], [])]));

    /// <summary>Answer for access reviews without a scripted answer; denied by default.</summary>
    public ProbeResponse<AccessReviewResult> DefaultReview { get; set; } = ProbeResponse<AccessReviewResult>.Ok(new AccessReviewResult(false, null));

    public List<ResourceAttributes> ReviewedAttributes { get; } = [];

    public ClusterConnection? OpenedConnection { get; private set; }

    public SensitiveString? OpenedToken { get; private set; }

    public bool SessionDisposed { get; private set; }

    public static Task<ProbeResponse<T>> Ok<T>(T value) => Task.FromResult(ProbeResponse<T>.Ok(value));

    public static Task<ProbeResponse<T>> Fail<T>(ProbeFailureKind kind, string message = "probe failed") =>
        Task.FromResult(ProbeResponse<T>.Fail(new ProbeFailure(kind, message)));

    /// <summary>Waits until cancelled, like a cluster that never answers.</summary>
    public static async Task<ProbeResponse<T>> Hang<T>(CancellationToken cancellationToken)
    {
        await Task.Delay(Timeout.Infinite, cancellationToken);
        throw new InvalidOperationException("unreachable");
    }

    public void Allow(params ResourceAttributes[] attributes)
    {
        foreach (var a in attributes)
        {
            _reviews[a] = ProbeResponse<AccessReviewResult>.Ok(new AccessReviewResult(true, null));
        }
    }

    public void AnswerReview(ResourceAttributes attributes, ProbeResponse<AccessReviewResult> answer) => _reviews[attributes] = answer;

    public IClusterProbeSession Open(ClusterConnection connection, SensitiveString token)
    {
        OpenedConnection = connection;
        OpenedToken = token;
        return new Session(this);
    }

    private sealed class Session(FakeProbeClient fake) : IClusterProbeSession
    {
        public Task<ProbeResponse<KubernetesVersionInfo>> GetVersionAsync(CancellationToken cancellationToken) => fake.Version(cancellationToken);

        public Task<ProbeResponse<SelfSubjectReviewInfo>> GetSelfSubjectReviewAsync(CancellationToken cancellationToken) =>
            fake.SelfSubjectReview(cancellationToken);

        public Task<ProbeResponse<ClusterVersionInfo>> GetClusterVersionAsync(CancellationToken cancellationToken) =>
            fake.ClusterVersion(cancellationToken);

        public Task<ProbeResponse<AccessReviewResult>> ReviewAccessAsync(ResourceAttributes attributes, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            lock (fake.ReviewedAttributes)
            {
                fake.ReviewedAttributes.Add(attributes);
            }

            return Task.FromResult(fake._reviews.TryGetValue(attributes, out var answer) ? answer : fake.DefaultReview);
        }

        public Task<ProbeResponse<RulesReviewResult>> ReviewRulesAsync(string namespaceName, CancellationToken cancellationToken) =>
            fake.RulesReview(namespaceName, cancellationToken);

        public ValueTask DisposeAsync()
        {
            fake.SessionDisposed = true;
            return ValueTask.CompletedTask;
        }
    }
}
