using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Tests.DevOAuth;

public sealed class DevOAuthConfigurationTests
{
    // Deliberately does not assert that CreateClient() throws (T-0094). WebApplicationFactory runs a minimal-hosting
    // entry point on its own thread: when ValidateOnStart fails inside app.RunAsync(), that thread disposes the host,
    // while the factory's DeferredHost.StartAsync may not yet have resolved IHostApplicationLifetime from it. Under load
    // the factory then throws ObjectDisposedException instead of the validation error. So the test takes the startup
    // validator out of the host start (the host starts cleanly) and runs that same validator itself: the one that
    // ValidateOnStart registered via Program.cs, against the shipped appsettings.json plus the override. That still pins
    // the configuration, the binding and the start-time registration, without the race.
    [Theory]
    [InlineData("DevOAuth:Users:1:Name", "admin", "duplicate Name 'admin'")]
    [InlineData("DevOAuth:Clients:0:ClientId", "", "needs a ClientId and a ClientSecret")]
    public void InvalidConfiguration_FailsAtStartup(string key, string value, string expectedMessage)
    {
        ServiceDescriptor? startupValidator = null;
        using var host = new DevOAuthFactory();
        using var factory = host.WithWebHostBuilder(builder => builder
            .UseSetting(key, value)
            .ConfigureTestServices(services =>
            {
                startupValidator = services.SingleOrDefault(d => d.ServiceType == typeof(IStartupValidator));
                services.RemoveAll<IStartupValidator>();
            }));

        var services = factory.Services; // starts the host, now without the start-time validation
        startupValidator.ShouldNotBeNull("ValidateOnStart() must register the startup validator");
        var implementationType = startupValidator.ImplementationType.ShouldNotBeNull();
        var validator = (IStartupValidator)ActivatorUtilities.CreateInstance(services, implementationType);

        var exception = Should.Throw<OptionsValidationException>(validator.Validate);

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
