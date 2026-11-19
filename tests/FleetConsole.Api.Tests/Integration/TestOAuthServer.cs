using System.Globalization;
using FleetConsole.DevOAuth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// The DevOAuth emulator hosted in-process as the host cluster's OAuth server and API server for one
/// <see cref="ApiFactory"/>: the shipped users (<c>admin</c>, <c>alice</c>, <c>bob</c>, <c>ines</c>) plus a pool of
/// throwaway users, so tests that need a user nobody else touches can take one (<see cref="ApiFactory.NewUsername"/>).
/// </summary>
/// <remarks>
/// The emulator's users are fixed at startup (its options are read once), hence a pool rather than users created on
/// demand. Pool users have no full name except the generated one; <c>pool-admin-*</c> users are in
/// <c>fleetconsole-admins</c>, the admin group of the Api's development configuration. Base address
/// <c>http://localhost</c>, so its discovery document advertises <c>http://localhost/oauth/…</c>.
/// </remarks>
public sealed class TestOAuthServer : WebApplicationFactory<DevOAuthEntryPoint>
{
    /// <summary>Number of regular pool users (<c>pool-user-001</c>…).</summary>
    public const int UserPoolSize = 300;

    /// <summary>Number of admin-group pool users (<c>pool-admin-001</c>…).</summary>
    public const int AdminPoolSize = 60;

    /// <summary>The admin group of the Api's development configuration.</summary>
    public const string AdminGroup = "fleetconsole-admins";

    // Config index far above the shipped users, so the pool never overlaps them.
    private const int FirstPoolIndex = 1000;

    private int _nextUser;
    private int _nextAdmin;

    /// <summary>Pool user name for <paramref name="number"/> (1-based).</summary>
    /// <param name="number">The pool position.</param>
    /// <returns>e.g. <c>pool-user-007</c>.</returns>
    public static string PoolUser(int number) => $"pool-user-{number.ToString("000", CultureInfo.InvariantCulture)}";

    /// <summary>Admin pool user name for <paramref name="number"/> (1-based).</summary>
    /// <param name="number">The pool position.</param>
    /// <returns>e.g. <c>pool-admin-007</c>.</returns>
    public static string PoolAdmin(int number) => $"pool-admin-{number.ToString("000", CultureInfo.InvariantCulture)}";

    /// <summary>Display name the emulator reports for a pool user.</summary>
    /// <param name="username">The pool username.</param>
    /// <returns>The <c>fullName</c>.</returns>
    public static string FullNameOf(string username) => $"Test {username}";

    /// <summary>Takes the next unused regular pool user.</summary>
    /// <returns>The username.</returns>
    public string NextUser() => Take(ref _nextUser, UserPoolSize, PoolUser);

    /// <summary>Takes the next unused pool user in <see cref="AdminGroup"/>.</summary>
    /// <returns>The username.</returns>
    public string NextAdmin() => Take(ref _nextAdmin, AdminPoolSize, PoolAdmin);

    /// <summary>A client for the emulator that doesn't follow redirects (the test reads them).</summary>
    /// <returns>The client.</returns>
    public HttpClient CreateBrowserClient() =>
        CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    /// <inheritdoc />
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        var index = FirstPoolIndex;
        for (var number = 1; number <= UserPoolSize; number++, index++)
        {
            AddUser(builder, index, PoolUser(number), group: null);
        }

        for (var number = 1; number <= AdminPoolSize; number++, index++)
        {
            AddUser(builder, index, PoolAdmin(number), AdminGroup);
        }
    }

    private static void AddUser(IWebHostBuilder builder, int index, string name, string? group)
    {
        builder.UseSetting($"DevOAuth:Users:{index}:Name", name);
        builder.UseSetting($"DevOAuth:Users:{index}:FullName", FullNameOf(name));
        if (group is not null)
        {
            builder.UseSetting($"DevOAuth:Users:{index}:Groups:0", group);
        }
    }

    private static string Take(ref int counter, int size, Func<int, string> name)
    {
        var number = Interlocked.Increment(ref counter);
        return number <= size
            ? name(number)
            : throw new InvalidOperationException($"The test OAuth server's user pool is exhausted ({size}); raise the pool size.");
    }
}
