using System.Reflection;

namespace FleetConsole.Domain;

/// <summary>
/// Anchor for the Domain assembly. Gives composition code (assembly scanning) and architecture tests a stable,
/// compile-time-checked handle on this layer without depending on any particular aggregate type.
/// </summary>
public static class DomainAssembly
{
    /// <summary>The Domain assembly (aggregates, value objects, domain events).</summary>
    public static Assembly Assembly { get; } = typeof(DomainAssembly).Assembly;
}
