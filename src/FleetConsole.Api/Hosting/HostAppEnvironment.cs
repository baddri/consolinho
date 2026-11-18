using System.Reflection;
using FleetConsole.Application.Abstractions;

namespace FleetConsole.Api.Hosting;

/// <summary>
/// <see cref="IAppEnvironment"/> backed by the ASP.NET Core host: the version is the Api assembly's informational
/// version (the SDK appends the git commit, e.g. <c>1.0.0+3f2c…</c>), the environment is
/// <see cref="IHostEnvironment.EnvironmentName"/>.
/// </summary>
/// <remarks>
/// The Api assembly is used rather than <see cref="Assembly.GetEntryAssembly"/> because under test hosts the entry
/// assembly is the test runner, and the Api is what gets deployed.
/// </remarks>
internal sealed class HostAppEnvironment(IHostEnvironment hostEnvironment) : IAppEnvironment
{
    private static readonly string ApiVersion = ReadVersion(typeof(HostAppEnvironment).Assembly);

    /// <inheritdoc />
    public string Version => ApiVersion;

    /// <inheritdoc />
    public string EnvironmentName => hostEnvironment.EnvironmentName;

    private static string ReadVersion(Assembly assembly) =>
        assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? assembly.GetName().Version?.ToString()
        ?? "unknown";
}
