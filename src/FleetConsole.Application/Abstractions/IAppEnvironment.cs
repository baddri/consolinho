namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port describing the running FleetConsole deployment (which build, which environment), so Application code can
/// report it without depending on ASP.NET Core hosting types.
/// </summary>
/// <remarks>Implemented by the Api (the composition root knows the entry assembly and the host environment).</remarks>
public interface IAppEnvironment
{
    /// <summary>
    /// The deployed build version: the Api assembly's informational version (e.g. <c>1.0.0+&lt;commit sha&gt;</c>),
    /// which identifies the exact build when reporting problems.
    /// </summary>
    string Version { get; }

    /// <summary>The hosting environment name (e.g. <c>Development</c>, <c>Production</c>).</summary>
    string EnvironmentName { get; }
}
