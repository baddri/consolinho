using System.Reflection;

namespace FleetConsole.Infrastructure;

/// <summary>
/// Anchor for the Infrastructure assembly. Used for scanning EF Core entity configurations and by architecture tests
/// that verify Infrastructure only depends inward (Application, Domain).
/// </summary>
public static class InfrastructureAssembly
{
    /// <summary>The Infrastructure assembly (persistence, crypto, Kubernetes HTTP clients).</summary>
    public static Assembly Assembly { get; } = typeof(InfrastructureAssembly).Assembly;
}
