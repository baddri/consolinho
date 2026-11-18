using System.Reflection;

namespace FleetConsole.Application;

/// <summary>
/// Anchor for the Application assembly. <c>AddApplication()</c> (T-0002) scans it for handlers and validators, and
/// architecture tests use it to verify the layer's dependency rules.
/// </summary>
public static class ApplicationAssembly
{
    /// <summary>The Application assembly (CQRS use cases, pipeline behaviors, ports).</summary>
    public static Assembly Assembly { get; } = typeof(ApplicationAssembly).Assembly;
}
