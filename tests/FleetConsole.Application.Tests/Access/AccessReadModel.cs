using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Auth;
using FleetConsole.Application.Tests.Clusters;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests.Access;

/// <summary>List-backed <see cref="IReadModel"/> (LINQ to Objects) with builders for users, clusters and grants.</summary>
internal sealed class AccessReadModel : IReadModel
{
    public List<User> UserRows { get; } = [];

    public List<Cluster> ClusterRows { get; } = [];

    public List<Credential> CredentialRows { get; } = [];

    public List<Grant> GrantRows { get; } = [];

    public IQueryable<User> Users => UserRows.AsQueryable();

    public IQueryable<Cluster> Clusters => ClusterRows.AsQueryable();

    public IQueryable<Credential> Credentials => CredentialRows.AsQueryable();

    public IQueryable<Grant> Grants => GrantRows.AsQueryable();

    public IQueryable<AuditEntry> AuditEntries => Enumerable.Empty<AuditEntry>().AsQueryable();

    public IQueryable<UserGroupCheck> UserGroupChecks => Enumerable.Empty<UserGroupCheck>().AsQueryable();

    public User AddUser(string username)
    {
        var user = AuthTestUsers.PreCreated(username);
        UserRows.Add(user);
        return user;
    }

    public Cluster AddCluster(string name, bool isEnabled = true)
    {
        var cluster = TestClusters.Create(name, isEnabled);
        ClusterRows.Add(cluster);
        return cluster;
    }

    /// <summary>Adds a direct grant with its own credential, optionally with saved inspect namespaces.</summary>
    public Credential AddGrant(User user, Cluster cluster, AccessMode mode, IReadOnlyList<string>? inspectNamespaces = null)
    {
        var credential = Credential.Add(
            cluster,
            CredentialName.Create($"sa-{user.Username.Value}-{cluster.Name.Value}").Value,
            null,
            new EncryptedToken([9, 9]),
            TokenFingerprint.Create("0123abcd").Value,
            TokenMetadata.Opaque,
            inspectNamespaces is null ? InspectNamespaces.Empty : InspectNamespaces.Create(inspectNamespaces).Value,
            "admin",
            FixedClock.Now);
        CredentialRows.Add(credential);
        GrantRows.Add(Grant.Create(user, cluster, credential, mode, new HashSet<ClusterId>(), "admin", FixedClock.Now).Value);
        return credential;
    }

    public Task<List<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.ToList());

    public Task<T?> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.FirstOrDefault());

    public Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Count());

    public Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Any());
}
