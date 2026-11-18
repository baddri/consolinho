using System.Reflection;
using FleetConsole.Application;
using FleetConsole.Domain;
using FleetConsole.Infrastructure;

namespace FleetConsole.Api.Tests;

/// <summary>
/// Enforces the layer dependency rules from docs/architecture/BACKEND.md:
/// Domain references nothing; Application references only Domain; Infrastructure never references Api.
/// </summary>
/// <remarks>
/// Uses compiled assembly references, so it only sees references that code actually uses (the compiler drops unused
/// ones). That is the property we care about: no type from a forbidden layer is used.
/// </remarks>
public sealed class ArchitectureTests
{
    private const string ApiAssemblyName = "FleetConsole.Api";
    private const string InfrastructureAssemblyName = "FleetConsole.Infrastructure";

    [Fact]
    public void Domain_DoesNotReferenceOtherFleetConsoleLayers()
    {
        FleetConsoleReferencesOf(DomainAssembly.Assembly).ShouldBeEmpty();
    }

    [Fact]
    public void Domain_ReferencesOnlyTheBaseClassLibrary()
    {
        var nonBcl = DomainAssembly.Assembly.GetReferencedAssemblies()
            .Select(a => a.Name!)
            .Where(name => !name.StartsWith("System", StringComparison.Ordinal)
                           && !name.Equals("netstandard", StringComparison.Ordinal)
                           && !name.Equals("mscorlib", StringComparison.Ordinal));

        nonBcl.ShouldBeEmpty();
    }

    [Fact]
    public void Application_DoesNotReferenceInfrastructureOrApi()
    {
        var references = FleetConsoleReferencesOf(ApplicationAssembly.Assembly);

        references.ShouldNotContain(InfrastructureAssemblyName);
        references.ShouldNotContain(ApiAssemblyName);
    }

    [Fact]
    public void Infrastructure_DoesNotReferenceApi()
    {
        FleetConsoleReferencesOf(InfrastructureAssembly.Assembly).ShouldNotContain(ApiAssemblyName);
    }

    private static string[] FleetConsoleReferencesOf(Assembly assembly) =>
        assembly.GetReferencedAssemblies()
            .Select(a => a.Name!)
            .Where(name => name.StartsWith("FleetConsole.", StringComparison.Ordinal))
            .ToArray();
}
