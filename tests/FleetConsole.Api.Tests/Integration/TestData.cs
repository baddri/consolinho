using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// Seeds and changes data of an <see cref="ApiFactory"/> host below HTTP, through the real aggregates, repositories and
/// unit of work (so audit entries are written as in production). Used by the endpoint tests of T-0015..T-0021 to arrange
/// state the admin API under test doesn't provide yet, or that the test isn't about.
/// </summary>
/// <remarks>
/// <para>Every call saves in its own signed-in scope (<c>CreateSignedInScope</c>, acting admin <see cref="Actor"/>), as
/// saving dispatches audit events and <c>AuditTrail</c> fails closed without an actor. The session lives in an
/// <c>AsyncLocal</c> set inside each method, so it never leaks into the calling test.</para>
/// <para>Names are unique per call unless given: tests share a database per host. Tokens are obviously fake.</para>
/// </remarks>
/// <param name="factory">The host to seed.</param>
public sealed class TestData(ApiFactory factory)
{
    /// <summary>Username of the admin recorded as actor of seeded changes.</summary>
    public const string Actor = "test-data";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static DateTimeOffset Now => DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds());

    /// <summary>Pre-creates a user (as an admin would, USR-2), optionally read-only and/or deactivated.</summary>
    /// <param name="username">The username; a fresh pool user (<see cref="ApiFactory.NewUsername"/>) when null, so the
    /// user can log in through the emulator.</param>
    /// <param name="role">The assigned role.</param>
    /// <param name="isReadOnly">Globally read-only (ADM-2).</param>
    /// <param name="deactivated">Deactivate after creating.</param>
    /// <returns>The user's id and name.</returns>
    public async Task<SeededUser> UserAsync(string? username = null, UserRole role = UserRole.User, bool isReadOnly = false, bool deactivated = false)
    {
        var name = Username.Create(username ?? factory.NewUsername()).Value;
        await using var scope = factory.Services.CreateSignedInScope(Actor);
        var users = scope.ServiceProvider.GetRequiredService<IUserRepository>();

        var user = User.PreCreate(name, role, isReadOnly, Actor, Now);
        users.Add(user);
        if (deactivated)
        {
            Ensure(user.Deactivate(UserId.New(), int.MaxValue));
        }

        await SaveAsync(scope);
        return new SeededUser(user.Id, name.Value);
    }

    /// <summary>Deactivates a user (rotates the security stamp, USR-4).</summary>
    /// <param name="username">The user.</param>
    /// <returns>A task that completes when saved.</returns>
    public Task DeactivateAsync(string username) =>
        ChangeUserAsync(username, (user, admins) => user.Deactivate(UserId.New(), admins));

    /// <summary>Reactivates a user (the stamp stays rotated).</summary>
    /// <param name="username">The user.</param>
    /// <returns>A task that completes when saved.</returns>
    public Task ReactivateAsync(string username) => ChangeUserAsync(username, (user, _) => user.Reactivate());

    /// <summary>Sets the global read-only flag.</summary>
    /// <param name="username">The user.</param>
    /// <param name="isReadOnly">The new value.</param>
    /// <returns>A task that completes when saved.</returns>
    public Task SetReadOnlyAsync(string username, bool isReadOnly) =>
        ChangeUserAsync(username, (user, admins) => user.SetReadOnly(isReadOnly, admins));

    /// <summary>Assigns a role (promote/demote by an admin).</summary>
    /// <param name="username">The user.</param>
    /// <param name="role">The new role.</param>
    /// <returns>A task that completes when saved.</returns>
    public Task SetRoleAsync(string username, UserRole role) =>
        ChangeUserAsync(username, (user, admins) => user.ChangeRole(role, UserId.New(), admins));

    /// <summary>Registers a cluster.</summary>
    /// <param name="name">The cluster name; unique when null.</param>
    /// <param name="isEnabled">Enabled (visible in the switcher once granted).</param>
    /// <param name="environment">The environment.</param>
    /// <param name="apiUrl">The API server URL.</param>
    /// <param name="caBundlePem">The CA bundle the cluster's API server certificate chains to (e.g.
    /// <see cref="FakeKubeApiServer.CaBundlePem"/>); none when null.</param>
    /// <param name="skipTlsVerify">Skip TLS verification (exclusive with <paramref name="caBundlePem"/>).</param>
    /// <returns>The cluster's id and name.</returns>
    public async Task<SeededCluster> ClusterAsync(
        string? name = null,
        bool isEnabled = true,
        ClusterEnvironment environment = ClusterEnvironment.Staging,
        string apiUrl = "https://api.test-cluster.example.com:6443",
        string? caBundlePem = null,
        bool skipTlsVerify = false)
    {
        var clusterName = ClusterName.Create(name ?? $"c-{Unique()}").Value;
        await using var scope = factory.Services.CreateSignedInScope(Actor);

        var cluster = Cluster.Register(
            clusterName,
            displayName: null,
            ApiServerEndpoint.Create(apiUrl, caBundlePem, skipTlsVerify).Value,
            environment,
            webConsoleUrl: null,
            description: "Seeded by TestData",
            isEnabled,
            Actor,
            Now);
        scope.ServiceProvider.GetRequiredService<IClusterRepository>().Add(cluster);

        await SaveAsync(scope);
        return new SeededCluster(cluster.Id, clusterName.Value);
    }

    /// <summary>
    /// Adds a credential to a cluster, with the token encrypted by the host's <see cref="ITokenProtector"/> and the same
    /// fingerprint and metadata derivation as the add endpoint, so seeded and API-created credentials can't diverge.
    /// </summary>
    /// <param name="clusterName">The cluster.</param>
    /// <param name="token">The plaintext token; an obviously fake unique one when null.</param>
    /// <param name="name">The credential name; unique when null.</param>
    /// <returns>The credential's id, name and plaintext token (for leak scans).</returns>
    public async Task<SeededCredential> CredentialAsync(string clusterName, string? token = null, string? name = null)
    {
        var plaintext = token ?? $"fake-test-token.{Unique()}{Unique()}.not-a-real-signature";
        await using var scope = factory.Services.CreateSignedInScope(Actor);
        var services = scope.ServiceProvider;
        var cluster = await services.GetRequiredService<IClusterRepository>().GetByNameAsync(ClusterName.Create(clusterName).Value, Ct)
            ?? throw new InvalidOperationException($"Cluster {clusterName} not found.");

        var credential = Credential.Add(
            cluster,
            CredentialName.Create(name ?? $"cred-{Unique()}").Value,
            description: "Seeded by TestData",
            services.GetRequiredService<ITokenProtector>().Protect(new SensitiveString(plaintext)),
            TokenFingerprints.Compute(new SensitiveString(plaintext)),
            TokenInspector.Inspect(new SensitiveString(plaintext)),
            Actor,
            Now);
        services.GetRequiredService<ICredentialRepository>().Add(credential);

        await SaveAsync(scope);
        return new SeededCredential(credential.Id, credential.Name.Value, plaintext);
    }

    /// <summary>Grants a user access to a cluster through a credential.</summary>
    /// <param name="username">The user.</param>
    /// <param name="clusterName">The cluster.</param>
    /// <param name="credentialId">A credential of that cluster.</param>
    /// <param name="mode">The access mode.</param>
    /// <returns>The grant's id.</returns>
    public async Task<GrantId> GrantAsync(string username, string clusterName, CredentialId credentialId, AccessMode mode = AccessMode.ReadOnly)
    {
        await using var scope = factory.Services.CreateSignedInScope(Actor);
        var services = scope.ServiceProvider;
        var user = await services.GetRequiredService<IUserRepository>().GetByUsernameAsync(Username.Create(username).Value, Ct)
            ?? throw new InvalidOperationException($"User {username} not found.");
        var cluster = await services.GetRequiredService<IClusterRepository>().GetByNameAsync(ClusterName.Create(clusterName).Value, Ct)
            ?? throw new InvalidOperationException($"Cluster {clusterName} not found.");
        var credential = await services.GetRequiredService<ICredentialRepository>().GetByIdAsync(credentialId, Ct)
            ?? throw new InvalidOperationException($"Credential {credentialId} not found.");
        var existing = await services.GetRequiredService<IGrantRepository>().GetClusterIdsForUserAsync(user.Id, Ct);

        var grant = Grant.Create(user, cluster, credential, mode, existing, Actor, Now);
        Ensure(grant);
        services.GetRequiredService<IGrantRepository>().Add(grant.Value);

        await SaveAsync(scope);
        return grant.Value.Id;
    }

    /// <summary>
    /// Seeds everything a proxy test needs in one call: an enabled cluster pointing at <paramref name="server"/> (its URL
    /// and CA bundle), a credential, and a grant for <paramref name="username"/> with <paramref name="mode"/>. The user
    /// is pre-created (role User) when it doesn't exist yet, so a fresh pool user can log in and use the grant.
    /// </summary>
    /// <param name="server">The fake API server standing in for the cluster.</param>
    /// <param name="username">The user to grant access to.</param>
    /// <param name="mode">The access mode.</param>
    /// <param name="token">The credential's plaintext token (what the fake should see as bearer); unique fake when null.</param>
    /// <returns>The seeded cluster and credential.</returns>
    public async Task<(SeededCluster Cluster, SeededCredential Credential)> ProxyClusterAsync(
        FakeKubeApiServer server, string username, AccessMode mode, string? token = null)
    {
        if (await FindUserAsync(username) is null)
        {
            await UserAsync(username);
        }

        var cluster = await ClusterAsync(apiUrl: server.BaseAddress.ToString(), caBundlePem: server.CaBundlePem);
        var credential = await CredentialAsync(cluster.Name, token);
        await GrantAsync(username, cluster.Name, credential.Id, mode);
        return (cluster, credential);
    }

    /// <summary>Reads a user as stored (for assertions).</summary>
    /// <param name="username">The username.</param>
    /// <returns>The user, or null.</returns>
    public async Task<User?> FindUserAsync(string username)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<IUserRepository>().GetByUsernameAsync(Username.Create(username).Value, Ct);
    }

    /// <summary>
    /// The audit entries that involve <paramref name="name"/> as target name or actor name, oldest first (for
    /// assertions on what an endpoint recorded).
    /// </summary>
    /// <param name="name">A username, cluster name, credential name …</param>
    /// <returns>The entries.</returns>
    public async Task<IReadOnlyList<AuditEntry>> AuditEntriesAsync(string name)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var readModel = scope.ServiceProvider.GetRequiredService<IReadModel>();
        var query = readModel.AuditEntries
            .Where(e => e.TargetName == name || e.Actor.Name == name)
            .OrderBy(e => e.OccurredAt);
        return await readModel.ToListAsync(query, Ct);
    }

    /// <summary>A unique lowercase suffix, valid in usernames and DNS labels.</summary>
    /// <returns>Ten hex characters.</returns>
    public static string Unique() => Guid.NewGuid().ToString("N")[..10];

    private async Task ChangeUserAsync(string username, Func<User, int, Result> change)
    {
        await using var scope = factory.Services.CreateSignedInScope(Actor);
        var users = scope.ServiceProvider.GetRequiredService<IUserRepository>();
        var user = await users.GetByUsernameAsync(Username.Create(username).Value, Ct)
            ?? throw new InvalidOperationException($"User {username} not found.");
        var admins = await users.CountActiveWritableAdminsAsync(Ct);

        Ensure(change(user, admins));
        await SaveAsync(scope);
    }

    private static async Task SaveAsync(AsyncServiceScope scope) =>
        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);

    private static void Ensure(Result result)
    {
        if (result.IsFailure)
        {
            throw new InvalidOperationException($"TestData change refused: {result.Error.Code} {result.Error.Message}");
        }
    }
}

/// <summary>A seeded user.</summary>
/// <param name="Id">The user id.</param>
/// <param name="Username">The username (an emulator user, so it can log in).</param>
public sealed record SeededUser(UserId Id, string Username);

/// <summary>A seeded cluster.</summary>
/// <param name="Id">The cluster id.</param>
/// <param name="Name">The cluster name.</param>
public sealed record SeededCluster(ClusterId Id, string Name);

/// <summary>A seeded credential.</summary>
/// <param name="Id">The credential id.</param>
/// <param name="Name">The credential name.</param>
/// <param name="Token">The plaintext token (obviously fake), for leak scans.</param>
public sealed record SeededCredential(CredentialId Id, string Name, string Token);
