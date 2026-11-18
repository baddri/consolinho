using System.Security.Claims;
using FleetConsole.Api.Auth;
using FleetConsole.Api.Tests.Integration;
using FleetConsole.Application.Abstractions;
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
