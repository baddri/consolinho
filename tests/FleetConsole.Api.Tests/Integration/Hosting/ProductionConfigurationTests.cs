using System.Net;
using FleetConsole.Api.Auth;
using FleetConsole.Api.Hosting;
using FleetConsole.Api.Tests.DevOAuth;
using FleetConsole.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Npgsql;

namespace FleetConsole.Api.Tests.Integration.Hosting;

/// <summary>
/// Production hardening of the real Program (ADR-0028 §6, T-0099): required settings are validated on start with
/// messages that name keys and never values (HOST-6), the key ring is encrypted with the mounted certificate (CFG-2),
/// and cookies are <c>Secure</c> although the app sees plain HTTP behind the edge Route (HOST-4). The certificate
/// failure cases are covered without a web host in <c>DataProtectionSetupTests</c>.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProductionConfigurationTests(ApiFactory factory)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task CompleteConfiguration_PassesStartValidation()
    {
        await using var host = ProductionHost.Create(factory);

        Should.NotThrow(() => RunStartValidation(host));
    }

    [Theory]
    [InlineData("Console:PublicOrigin")]
    [InlineData($"ConnectionStrings:{ConsoleDbContext.ConnectionName}")]
    public async Task MissingRequiredSetting_FailsStartValidation_NamingTheKeyOnly(string key)
    {
        await using var host = ProductionHost.Create(factory, new Dictionary<string, string?> { [key] = "" });

        var exception = Should.Throw<OptionsValidationException>(() => RunStartValidation(host));

        exception.Failures.ShouldContain(failure => failure.StartsWith(key, StringComparison.Ordinal));
        exception.Message.ShouldNotContain(DevOAuthFlow.ClientSecret);
        exception.Message.ShouldNotContain(TestHostConfiguration.CertificatePassword);
    }

    [Fact]
    public async Task SeveralInvalidOptionsTypes_AreAllReportedAsConfigurationFailures()
    {
        // A typical first deploy: several settings missing at once. The startup validator then throws an
        // AggregateException of OptionsValidationExceptions, which Program must still turn into Critical lines.
        var publicOrigin = "Console:PublicOrigin";
        var connectionString = $"ConnectionStrings:{ConsoleDbContext.ConnectionName}";
        await using var host = ProductionHost.Create(factory, new Dictionary<string, string?>
        {
            [publicOrigin] = "",
            [connectionString] = "",
        });

        var exception = Should.Throw<Exception>(() => RunStartValidation(host));

        exception.ShouldBeOfType<AggregateException>();
        ConsoleHostRunner.TryGetConfigurationFailures(exception, out var failures).ShouldBeTrue();
        failures.ShouldContain(failure => failure.StartsWith(publicOrigin, StringComparison.Ordinal));
        failures.ShouldContain(failure => failure.StartsWith(connectionString, StringComparison.Ordinal));
    }

    [Fact]
    public void NonValidationExceptions_AreNotTreatedAsConfigurationFailures()
    {
        var mixed = new AggregateException(new OptionsValidationException("x", typeof(object), ["x is required."]), new InvalidOperationException("bug"));

        ConsoleHostRunner.TryGetConfigurationFailures(mixed, out _).ShouldBeFalse();
        ConsoleHostRunner.TryGetConfigurationFailures(new InvalidOperationException("bug"), out _).ShouldBeFalse();
    }

    [Fact]
    public async Task KeyRing_IsEncryptedWithTheCertificate()
    {
        var connectionString = factory.Postgres.ConnectionStringFor($"cfg2_{Guid.NewGuid():N}");
        await using var host = ProductionHost.Create(factory, new Dictionary<string, string?>
        {
            [$"ConnectionStrings:{ConsoleDbContext.ConnectionName}"] = connectionString,
        });
        // Production has no auto-migration: prepare the fresh database like the init container does.
        await DatabaseMigrator.MigrateAsync(host.Services, Ct);

        // Protecting the first payload creates the first key in the (empty) key ring.
        host.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector("test").Protect("fake-payload");

        var keys = await ReadKeyRingAsync(connectionString);
        keys.ShouldNotBeEmpty();
        keys.ShouldAllBe(xml => xml.Contains("encryptedSecret", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Login_OverPlainHttp_SetsOnlySecureCookies()
    {
        await using var host = ProductionHost.Create(factory);
        using var client = host.CreateClient();

        using var response = await client.GetAsync(new Uri("/api/auth/login", UriKind.Relative), Ct);

        response.StatusCode.ShouldBe(HttpStatusCode.Redirect);
        var cookies = response.Headers.GetValues("Set-Cookie").ToArray();
        cookies.ShouldNotBeEmpty();
        cookies.ShouldAllBe(cookie => cookie.Contains("; secure", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task SessionCookie_IsSecureHttpOnlyLax()
    {
        await using var host = ProductionHost.Create(factory);

        var cookie = host.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get(SessionDefaults.Scheme).Cookie;

        cookie.SecurePolicy.ShouldBe(CookieSecurePolicy.Always);
        cookie.HttpOnly.ShouldBeTrue();
        cookie.SameSite.ShouldBe(SameSiteMode.Lax);
    }

    /// <summary>
    /// Runs the host's start-time validation (every <c>ValidateOnStart</c>) outside the host start. Letting the start
    /// itself fail is racy under WebApplicationFactory (see <c>DevOAuthConfigurationTests</c>, T-0094) and Program turns
    /// the failure into an exit code; so the validator is taken out of the start and run here.
    /// </summary>
    private static void RunStartValidation(ProductionHost host)
    {
        ServiceDescriptor? startupValidator = null;
        using var withoutValidation = host.Factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            startupValidator = services.SingleOrDefault(d => d.ServiceType == typeof(IStartupValidator));
            services.RemoveAll<IStartupValidator>();
        }));

        var services = withoutValidation.Services;
        var implementationType = startupValidator.ShouldNotBeNull().ImplementationType.ShouldNotBeNull();
        ((IStartupValidator)ActivatorUtilities.CreateInstance(services, implementationType)).Validate();
    }

    private static async Task<List<string>> ReadKeyRingAsync(string connectionString)
    {
        var keys = new List<string>();
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("select xml from data_protection_keys", connection);
        await using var reader = await command.ExecuteReaderAsync(Ct);
        while (await reader.ReadAsync(Ct))
        {
            keys.Add(reader.GetString(0));
        }

        return keys;
    }
}
