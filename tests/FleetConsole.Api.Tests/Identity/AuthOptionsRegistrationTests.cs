using FleetConsole.Application.Auth;
using FleetConsole.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.Identity;

/// <summary><see cref="AuthOptions"/> as bound and validated by <c>AddInfrastructure</c> (section <c>Auth</c>).</summary>
public sealed class AuthOptionsRegistrationTests
{
    private static AuthOptions Resolve(Dictionary<string, string?> configuration)
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { EnvironmentName = "Production", DisableDefaults = true });
        builder.Configuration.AddInMemoryCollection(configuration);
        builder.AddInfrastructure();
        using var provider = builder.Services.BuildServiceProvider();
        return provider.GetRequiredService<IOptions<AuthOptions>>().Value;
    }

    [Fact]
    public void Defaults_AutoProvisionOn_NoConfigurationAdmins()
    {
        var options = Resolve([]);

        options.AutoProvision.ShouldBeTrue();
        options.BootstrapAdminUsers.ShouldBeEmpty();
        options.AdminGroups.ShouldBeEmpty();
    }

    [Fact]
    public void Binds_TheAuthSection()
    {
        var options = Resolve(new()
        {
            ["Auth:AutoProvision"] = "false",
            ["Auth:BootstrapAdminUsers:0"] = "root",
            ["Auth:AdminGroups:0"] = "fleetconsole-admins",
            ["Auth:AdminGroups:1"] = "sre-leads",
        });

        options.AutoProvision.ShouldBeFalse();
        options.BootstrapAdminUsers.ShouldBe(["root"]);
        options.AdminGroups.ShouldBe(["fleetconsole-admins", "sre-leads"]);
    }

    [Theory]
    [InlineData("Auth:AdminGroups:0", "system:authenticated", "virtual system:* groups")]
    [InlineData("Auth:AdminGroups:0", " ", "AdminGroups must not contain blank")]
    [InlineData("Auth:BootstrapAdminUsers:0", " ", "BootstrapAdminUsers must not contain blank")]
    public void InvalidEntries_AreRefused(string key, string value, string expected)
    {
        Should.Throw<OptionsValidationException>(() => Resolve(new() { [key] = value }))
            .Message.ShouldContain(expected);
    }
}
