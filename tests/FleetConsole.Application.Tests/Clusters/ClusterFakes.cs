using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Tests.Clusters;

/// <summary>In-memory <see cref="IClusterRepository"/> for the cluster handler tests.</summary>
internal sealed class InMemoryClusterRepository : IClusterRepository
{
    public List<Cluster> Clusters { get; } = [];

    public List<Cluster> Removed { get; } = [];

    public Task<Cluster?> GetByIdAsync(ClusterId id, CancellationToken cancellationToken) =>
        Task.FromResult(Clusters.SingleOrDefault(c => c.Id == id));

    public Task<Cluster?> GetByNameAsync(ClusterName name, CancellationToken cancellationToken) =>
        Task.FromResult(Clusters.SingleOrDefault(c => c.Name == name));

    public Task<IReadOnlyList<Cluster>> GetByNamesAsync(IReadOnlyCollection<ClusterName> names, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Cluster>>(Clusters.Where(c => names.Contains(c.Name)).ToList());

    public Task<bool> ExistsAsync(ClusterName name, CancellationToken cancellationToken) =>
        Task.FromResult(Clusters.Any(c => c.Name == name));

    public void Add(Cluster cluster) => Clusters.Add(cluster);

    public void Remove(Cluster cluster)
    {
        Clusters.Remove(cluster);
        Removed.Add(cluster);
    }
}

/// <summary>Builds clusters for the handler tests.</summary>
internal static class TestClusters
{
    public static readonly DateTimeOffset Registered = new(2026, 11, 1, 8, 0, 0, TimeSpan.Zero);

    public static Cluster Create(string name = "prod-east", bool isEnabled = true) =>
        Cluster.Register(
            ClusterName.Create(name).Value,
            displayName: null,
            ApiServerEndpoint.Create("https://api.prod-east.example.com:6443", caBundlePem: null, skipTlsVerify: false).Value,
            ClusterEnvironment.Production,
            ClusterDistribution.OpenShift,
            webConsoleUrl: null,
            description: null,
            isEnabled,
            "seed",
            Registered);
}
