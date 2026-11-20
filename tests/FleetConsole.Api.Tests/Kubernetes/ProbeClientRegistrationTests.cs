using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Infrastructure;
using FleetConsole.Infrastructure.Kubernetes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Api.Tests.Kubernetes;

/// <summary><c>AddInfrastructure</c> wires the probe port to the real adapter as a singleton (ADR-0011).</summary>
public sealed class ProbeClientRegistrationTests
{
    [Fact]
    public void AddInfrastructure_RegistersClusterProbeClientAsSingleton()
    {
        var builder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { EnvironmentName = Environments.Production });
        builder.AddInfrastructure();
        using var services = builder.Services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = true });

        var first = services.GetRequiredService<IClusterProbeClient>();

        first.ShouldBeOfType<ClusterProbeClient>();
        services.GetRequiredService<IClusterProbeClient>().ShouldBeSameAs(first);
        services.GetRequiredService<ClusterTlsHandlerFactory>().ShouldNotBeNull();
    }
}
