using FleetConsole.Api.Tests.Fakes;
using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// Builds valid aggregates with unique natural keys for persistence tests, which share one database with every other
/// integration test. Timestamps are whole seconds in UTC: PostgreSQL stores microseconds and only UTC offsets.
/// </summary>
internal static class PersistenceTestData
{
    public const string Admin = "admin-tester";

    private static readonly Lazy<string> CaPem = new(() =>
    {
        using var authority = new TestCertificateAuthority("Persistence Test CA");
        return authority.CertificatePem;
    });

    /// <summary>A real CA certificate in PEM form, for clusters with a CA bundle.</summary>
    public static string CaBundlePem => CaPem.Value;

    public static DateTimeOffset Now { get; } =
        DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds());

    /// <summary>A unique lowercase suffix, valid in usernames and DNS labels.</summary>
    public static string Unique() => Guid.NewGuid().ToString("N")[..10];

    public static Username NewUsername(string prefix = "user") => Username.Create($"{prefix}-{Unique()}").Value;

    public static User NewUser(UserRole role = UserRole.User, bool isReadOnly = false, Username? username = null) =>
        User.PreCreate(username ?? NewUsername(), role, isReadOnly, Admin, Now);

    public static ClusterName NewClusterName() => ClusterName.Create($"c-{Unique()}").Value;

    public static Cluster NewCluster(bool withCaBundle = false, bool isEnabled = false, ClusterName? name = null) =>
        Cluster.Register(
            name ?? NewClusterName(),
            displayName: "Persistence test cluster",
            ApiServerEndpoint.Create("https://API.persistence.example.com:6443/", withCaBundle ? CaBundlePem : null, skipTlsVerify: false).Value,
            ClusterEnvironment.Staging,
            new Uri("https://console.persistence.example.com/dashboards?tab=1"),
            description: "Used by persistence tests",
            isEnabled,
            Admin,
            Now);

    public static Credential NewCredential(Cluster cluster, ITokenProtector protector, string? token = null, CredentialName? name = null) =>
        Credential.Add(
            cluster,
            name ?? CredentialName.Create($"cred-{Unique()}").Value,
            description: "Fake SA token for tests",
            protector.Protect(new SensitiveString(token ?? FakeToken())),
            TokenFingerprint.Create("0123abcd").Value,
            new TokenMetadata(TokenType.Jwt, "system:serviceaccount:fleet:viewer", Now.AddDays(-1), Now.AddDays(30)),
            Admin,
            Now);

    public static Grant NewGrant(User user, Cluster cluster, Credential credential, AccessMode mode = AccessMode.ReadOnly) =>
        Grant.Create(user, cluster, credential, mode, new HashSet<ClusterId>(), Admin, Now).Value;

    /// <summary>An obviously fake, unique token-shaped string (never a real credential).</summary>
    public static string FakeToken() => $"fake-test-token.{Unique()}{Unique()}.not-a-real-signature";
}
