using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.DevOAuth;

public sealed class DevOAuthConfigurationTests
{
    [Theory]
    [InlineData("DevOAuth:Users:1:Name", "admin", "duplicate Name 'admin'")]
    [InlineData("DevOAuth:Clients:0:ClientId", "", "needs a ClientId and a ClientSecret")]
    public void InvalidConfiguration_FailsAtStartup(string key, string value, string expectedMessage)
    {
        using var host = new DevOAuthFactory();
        using var factory = host.WithWebHostBuilder(builder => builder.UseSetting(key, value));

        var exception = Should.Throw<OptionsValidationException>(() => factory.CreateClient());

        exception.Message.ShouldContain(expectedMessage);
    }

    [Fact]
    public void NonDevelopmentEnvironment_RefusesToStart()
    {
        using var host = new DevOAuthFactory();
        using var factory = host.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));

        var exception = Should.Throw<InvalidOperationException>(() => factory.CreateClient());

        exception.Message.ShouldContain("development-only");
    }
}
