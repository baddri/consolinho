using FleetConsole.Application.Abstractions;

namespace FleetConsole.Application.Tests;

/// <summary>Fixed <see cref="IAppEnvironment"/> for handler tests and for the container built by <see cref="ServiceProviderBuilder"/>.</summary>
internal sealed class FakeAppEnvironment(string version = "1.2.3+abc123", string environmentName = "Staging") : IAppEnvironment
{
    public string Version { get; } = version;

    public string EnvironmentName { get; } = environmentName;
}
