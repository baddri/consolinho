using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using FleetConsole.Api.Tests.Persistence;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Integration.Admin.Clusters;

/// <summary>
/// Seeding and request helpers the cluster endpoint tests need beyond <see cref="TestData"/>: credentials with JWT
/// expiry metadata, recorded connection tests, generated CA certificates and request bodies.
/// </summary>
internal static class ClusterTestSupport
{
    public const string ClustersPath = "/api/admin/clusters";

    // One writable and one read-only admin per factory for all cluster tests: the emulator's admin pool is small and
    // shared by the whole collection, and these tests only need *an* admin, not a fresh one each.
    private static readonly ConcurrentDictionary<ApiFactory, Lazy<Task<string>>> Admins = new();
    private static readonly ConcurrentDictionary<ApiFactory, Lazy<Task<string>>> ReadOnlyAdmins = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>A signed-in client of the shared writable admin (by configuration).</summary>
    public static async Task<HttpClient> AdminClientAsync(this ApiFactory factory) =>
        await factory.LoginAsAsync(await Admins.GetOrAdd(
            factory, f => new Lazy<Task<string>>(() => Task.FromResult(f.NewAdminUsername()))).Value);

    /// <summary>A signed-in client of the shared read-only admin (ADM-2).</summary>
    public static async Task<HttpClient> ReadOnlyAdminClientAsync(this ApiFactory factory) =>
        await factory.LoginAsAsync(await ReadOnlyAdmins.GetOrAdd(factory, f => new Lazy<Task<string>>(async () =>
            (await f.Data.UserAsync(role: UserRole.Admin, isReadOnly: true)).Username)).Value);

    /// <summary>A user who never logs in (e.g. a grantee), so it takes nothing from the emulator's user pool.</summary>
    public static async Task<string> OfflineUserAsync(this ApiFactory factory) =>
        (await factory.Data.UserAsync(username: $"grantee-{TestData.Unique()}")).Username;

    /// <summary>The path of one cluster.</summary>
    public static string ClusterPath(string name) => $"{ClustersPath}/{name}";

    /// <summary>A valid register body; override fields through <paramref name="change"/>.</summary>
    public static Dictionary<string, object?> RegisterBody(string name, Action<Dictionary<string, object?>>? change = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["name"] = name,
            ["displayName"] = null,
            ["apiUrl"] = "https://api.new-cluster.example.com:6443",
            ["environment"] = "staging",
            ["distribution"] = "openShift",
            ["webConsoleUrl"] = null,
            ["description"] = null,
            ["caBundle"] = null,
            ["skipTlsVerify"] = false,
        };
        change?.Invoke(body);
        return body;
    }

    /// <summary>An update body that repeats the seeded cluster's settings (TestData defaults) at <paramref name="version"/>.</summary>
    public static Dictionary<string, object?> UpdateBody(uint version, Action<Dictionary<string, object?>>? change = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["displayName"] = null,
            ["apiUrl"] = "https://api.test-cluster.example.com:6443",
            ["environment"] = "staging",
            ["distribution"] = "openShift",
            ["webConsoleUrl"] = null,
            ["description"] = "Seeded by TestData",
            ["caBundle"] = null,
            ["skipTlsVerify"] = false,
            ["version"] = version,
        };
        change?.Invoke(body);
        return body;
    }

    /// <summary>Reads a JSON response body.</summary>
    public static async Task<JsonElement> JsonAsync(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct));

    /// <summary>Asserts a ProblemDetails response with <paramref name="status"/> and <paramref name="code"/>; returns the body.</summary>
    public static async Task<JsonElement> ShouldBeProblemAsync(this HttpResponseMessage response, HttpStatusCode status, string? code)
    {
        response.StatusCode.ShouldBe(status);
        response.Content.Headers.ContentType?.MediaType.ShouldBe("application/problem+json");
        var body = await response.JsonAsync();
        if (code is not null)
        {
            body.GetProperty("code").GetString().ShouldBe(code);
        }

        return body;
    }

    /// <summary>Asserts a 400 <c>Validation.Failed</c> whose <c>errors</c> contain <paramref name="field"/>.</summary>
    public static async Task ShouldBeFieldErrorAsync(this HttpResponseMessage response, string field)
    {
        var body = await response.ShouldBeProblemAsync(HttpStatusCode.BadRequest, "Validation.Failed");
        var errors = body.GetProperty("errors");
        errors.TryGetProperty(field, out var messages).ShouldBeTrue($"errors: {errors}");
        messages.GetArrayLength().ShouldBeGreaterThan(0);
    }

    /// <summary>GETs a cluster's detail and returns it.</summary>
    public static async Task<JsonElement> GetDetailAsync(this HttpClient client, string name)
    {
        using var response = await client.GetAsync(new Uri(ClusterPath(name), UriKind.Relative), Ct);
        response.EnsureSuccessStatusCode();
        return await response.JsonAsync();
    }

    /// <summary>GETs the cluster list and returns the item for <paramref name="name"/>.</summary>
    public static async Task<JsonElement> GetListItemAsync(this HttpClient client, string name)
    {
        using var response = await client.GetAsync(new Uri(ClustersPath, UriKind.Relative), Ct);
        response.EnsureSuccessStatusCode();
        var items = await response.JsonAsync();
        return items.EnumerateArray().Single(item => item.GetProperty("name").GetString() == name);
    }

    /// <summary>The current <c>version</c> of a cluster, read through the API.</summary>
    public static async Task<uint> VersionAsync(this HttpClient client, string name) =>
        (await client.GetDetailAsync(name)).GetProperty("version").GetUInt32();

    /// <summary>Adds a credential whose token is a JWT with the given expiry (or none).</summary>
    public static async Task<CredentialId> JwtCredentialAsync(ApiFactory factory, string clusterName, DateTimeOffset? expiresAt)
    {
        await using var scope = factory.Services.CreateSignedInScope(TestData.Actor);
        var services = scope.ServiceProvider;
        var cluster = await LoadClusterAsync(services, clusterName);
        var token = $"fake-jwt.{TestData.Unique()}.not-a-real-signature";

        var credential = Credential.Add(
            cluster,
            CredentialName.Create($"jwt-{TestData.Unique()}").Value,
            description: null,
            services.GetRequiredService<ITokenProtector>().Protect(new SensitiveString(token)),
            TokenFingerprint.Create(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)))[..8]).Value,
            new TokenMetadata(TokenType.Jwt, "system:serviceaccount:fleet:console", DateTimeOffset.UtcNow.AddDays(-1), expiresAt),
            TestData.Actor,
            DateTimeOffset.UtcNow);
        services.GetRequiredService<ICredentialRepository>().Add(credential);
        await services.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
        return credential.Id;
    }

    /// <summary>Stores a connection test summary on a credential, as the test endpoint (T-0018) would.</summary>
    public static async Task RecordTestAsync(
        ApiFactory factory, string clusterName, CredentialId credentialId, DateTimeOffset testedAt, bool succeeded = true)
    {
        await using var scope = factory.Services.CreateSignedInScope(TestData.Actor);
        var services = scope.ServiceProvider;
        var credential = await services.GetRequiredService<ICredentialRepository>().GetByIdAsync(credentialId, Ct)
            ?? throw new InvalidOperationException($"Credential {credentialId} not found.");

        credential.RecordTest(
            new ConnectionTestSummary(
                testedAt,
                succeeded,
                succeeded ? null : ConnectionTestStep.Authentication,
                succeeded ? CapabilityLevel.ClusterWideView : null),
            clusterName);
        await services.GetRequiredService<IUnitOfWork>().SaveChangesAsync(Ct);
    }

    /// <summary>Counts the stored credentials and grants of a cluster (by id, so it works after the cluster is gone).</summary>
    public static async Task<(int Credentials, int Grants)> RowCountsAsync(ApiFactory factory, ClusterId clusterId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var readModel = scope.ServiceProvider.GetRequiredService<IReadModel>();
        var credentials = await readModel.CountAsync(readModel.Credentials.Where(c => c.ClusterId == clusterId), Ct);
        var grants = await readModel.CountAsync(readModel.Grants.Where(g => g.ClusterId == clusterId), Ct);
        return (credentials, grants);
    }

    /// <summary>A self-signed CA certificate in PEM, valid from yesterday until <paramref name="notAfter"/>.</summary>
    public static string CaPem(string commonName, DateTimeOffset notAfter)
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest($"CN={commonName}", key, HashAlgorithmName.SHA256);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), notAfter);
        return certificate.ExportCertificatePem() + "\n";
    }

    private static async Task<Cluster> LoadClusterAsync(IServiceProvider services, string clusterName) =>
        await services.GetRequiredService<IClusterRepository>().GetByNameAsync(ClusterName.Create(clusterName).Value, Ct)
        ?? throw new InvalidOperationException($"Cluster {clusterName} not found.");
}
