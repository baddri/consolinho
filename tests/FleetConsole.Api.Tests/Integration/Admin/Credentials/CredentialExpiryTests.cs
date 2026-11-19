using System.Text.Json;
using FleetConsole.Api.Tests.Identity;
using static FleetConsole.Api.Tests.Integration.Admin.Credentials.CredentialApi;

namespace FleetConsole.Api.Tests.Integration.Admin.Credentials;

/// <summary>
/// CRED-4 expiry statuses through HTTP with a manual clock, including both edges of the <c>expiringSoon</c> window
/// (<c>Credentials:ExpiryWarningDays</c>, set to 10 here to prove the setting is used). One variant host for the class.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class CredentialExpiryTests(ApiFactory factory) : IAsyncLifetime
{
    private const int WarningDays = 10;

    private readonly ManualClock _clock = new();
    private ApiFactory _host = null!;

    /// <inheritdoc />
    public async ValueTask InitializeAsync() =>
        _host = await factory.CreateVariantAsync(
            new Dictionary<string, string?> { ["Credentials:ExpiryWarningDays"] = WarningDays.ToString(System.Globalization.CultureInfo.InvariantCulture) },
            clock: _clock);

    /// <inheritdoc />
    public async ValueTask DisposeAsync() => await _host.DisposeAsync();

    [Fact]
    public async Task ExpiryStatus_FollowsTheClockAndTheWarningWindow()
    {
        var now = _clock.UtcNow;
        var window = TimeSpan.FromDays(WarningDays);
        var cluster = await _host.Data.ClusterAsync();
        using var admin = await _host.LoginAsAsync(_host.NewAdminUsername());

        var expectations = new (string Token, string Status)[]
        {
            (Jwt(exp: now.AddSeconds(-1)), "expired"),
            (Jwt(exp: now), "expired"),                         // RFC 7519: not accepted on or after exp
            (Jwt(exp: now.AddSeconds(1)), "expiringSoon"),
            (Jwt(exp: now + window), "expiringSoon"),           // window is inclusive
            (Jwt(exp: now + window + TimeSpan.FromSeconds(1)), "ok"),
            (Jwt(), "noExpiry"),
            (Opaque(), "unknown"),
        };

        foreach (var (token, status) in expectations)
        {
            var body = await AddOkAsync(admin, cluster.Name, token);
            body.GetProperty("expiryStatus").GetString().ShouldBe(status, $"exp of {token[..12]}… at {now:O}");
            body.GetProperty("expiryWarningDays").GetInt32().ShouldBe(WarningDays);
        }

        // Moving the clock changes the derived status without touching the credential.
        _clock.Advance(window);
        var list = JsonDocument.Parse(await GetBodyAsync(admin, $"/api/admin/clusters/{cluster.Name}/credentials")).RootElement;
        list.EnumerateArray().Count(c => c.GetProperty("expiryStatus").GetString() == "ok").ShouldBe(0);
        list.EnumerateArray().Count(c => c.GetProperty("expiryStatus").GetString() == "expired").ShouldBe(4);
        list.EnumerateArray().Count(c => c.GetProperty("expiryStatus").GetString() == "expiringSoon").ShouldBe(1);
    }
}
