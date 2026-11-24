using System.Security.Claims;
using FleetConsole.Api.Auth;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions;
using FleetConsole.Infrastructure.Crypto;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;
using static FleetConsole.Api.Tests.Persistence.PersistenceTestData;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// The Data Protection key ring lives in the database (ADR-0004), so everything it protects is shared by all host
/// instances over the same database (replicas, restarts) and by nothing else. Covers the session cookie's ticket
/// protector (requested by the T-0011 review: sessions must survive restarts and work across replicas) and SA tokens.
/// </summary>
/// <remarks>
/// The negative control matters: without a configured repository, Data Protection falls back to a key directory in the
/// user profile, which two hosts in one test process would share too. Only the database-backed ring makes a host over
/// a <em>different</em> database unable to read the payloads.
/// </remarks>
[Collection(ApiCollectionDefinition.Name)]
public sealed class DataProtectionKeyRingTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task SessionTicket_IssuedByOneHost_IsAcceptedByAnotherHostOverTheSameDatabase_Only()
    {
        var username = $"session-{Unique()}";
        var cookieValue = TicketFormat(factory.Services).Protect(Ticket(username));
        var encryptedToken = factory.Services.GetRequiredService<ITokenProtector>().Protect(new SensitiveString("fake-shared-token"));

        await using (var replica = new ApiHostOverDatabase(factory.ConnectionString))
        {
            var ticket = TicketFormat(replica.Services).Unprotect(cookieValue);

            ticket.ShouldNotBeNull("a second instance over the same database must accept the session cookie");
            ticket.Principal.FindFirst(SessionClaims.Username)!.Value.ShouldBe(username);
            ticket.AuthenticationScheme.ShouldBe(SessionDefaults.Scheme);
            replica.Services.GetRequiredService<ITokenProtector>().Unprotect(encryptedToken).Reveal().ShouldBe("fake-shared-token");
        }

        await using (var isolated = new ApiHostOverDatabase(await CreateEmptyDatabaseAsync()))
        {
            TicketFormat(isolated.Services).Unprotect(cookieValue)
                .ShouldBeNull("a host with another key ring must not accept the cookie");
            Should.Throw<System.Security.Cryptography.CryptographicException>(
                () => isolated.Services.GetRequiredService<ITokenProtector>().Unprotect(encryptedToken));
        }
    }

    /// <summary>
    /// T-0231 (ADR-0030 amendment 2026-11-24): three replicas, each with its own Data Protection cache, cold-start at
    /// once against an empty key table. The key-ring lock makes exactly one of them create the first key; the others
    /// load it, so a payload protected on any replica unprotects on every other one.
    /// </summary>
    [Fact]
    public async Task ConcurrentColdStarts_OnAnEmptyKeyTable_ShareOneKey()
    {
        _ = factory.Services; // creates the shared database the empty one is created from (filtered runs)
        var connectionString = await CreateEmptyDatabaseAsync();
        var replicas = Enumerable.Range(0, 3).Select(_ => new ApiHostOverDatabase(connectionString)).ToArray();
        try
        {
            // Resolving Services builds and starts a host: migration (under its own lock), then the background warm-up.
            await Task.WhenAll(replicas.Select(replica => Task.Run(() => replica.Services, Ct)));
            foreach (var replica in replicas)
            {
                await WaitUntilKeyRingLoadedAsync(replica.Services);
            }

            (await KeyCountAsync(connectionString)).ShouldBe(1L, "concurrent cold starts must create one shared first key");

            var payloads = replicas.Select((replica, i) => Protector(replica.Services).Protect($"payload-{i}")).ToArray();
            for (var from = 0; from < replicas.Length; from++)
            {
                for (var to = 0; to < replicas.Length; to++)
                {
                    Protector(replicas[to].Services).Unprotect(payloads[from]).ShouldBe($"payload-{from}");
                }
            }
        }
        finally
        {
            foreach (var replica in replicas)
            {
                await replica.DisposeAsync();
            }
        }
    }

    private static IDataProtector Protector(IServiceProvider services) =>
        services.GetRequiredService<IDataProtectionProvider>().CreateProtector("FleetConsole.Tests.KeyRingSharing");

    private static async Task WaitUntilKeyRingLoadedAsync(IServiceProvider services)
    {
        var state = services.GetRequiredService<KeyRingWarmupState>();
        var deadline = DateTimeOffset.UtcNow.AddSeconds(30);
        while (!state.IsLoaded && DateTimeOffset.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(50), Ct);
        }

        state.IsLoaded.ShouldBeTrue("the key-ring warm-up must finish over a reachable database");
    }

    private static async Task<long> KeyCountAsync(string connectionString)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("select count(*) from data_protection_keys", connection);
        return (long)(await command.ExecuteScalarAsync(Ct))!;
    }

    private static ISecureDataFormat<AuthenticationTicket> TicketFormat(IServiceProvider services) =>
        services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(SessionDefaults.Scheme).TicketDataFormat;

    private static AuthenticationTicket Ticket(string username) =>
        new(
            new ClaimsPrincipal(new ClaimsIdentity([new Claim(SessionClaims.Username, username)], SessionDefaults.Scheme)),
            SessionDefaults.Scheme);

    private async Task<string> CreateEmptyDatabaseAsync()
    {
        var database = $"keyring_{Unique()}";
        await using (var connection = new NpgsqlConnection(factory.ConnectionString))
        {
            await connection.OpenAsync(Ct);
            await using var command = new NpgsqlCommand($"create database {database}", connection);
            await command.ExecuteNonQueryAsync(Ct);
        }

        return new NpgsqlConnectionStringBuilder(factory.ConnectionString) { Database = database }.ConnectionString;
    }
}
