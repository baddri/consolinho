using System.Reflection;
using System.Text.RegularExpressions;
using FleetConsole.Application;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain;
using FleetConsole.Infrastructure;

namespace FleetConsole.Api.Tests;

/// <summary>
/// Enforces the layer dependency rules and use case conventions from docs/architecture/BACKEND.md:
/// Domain references only the BCL; Application references only Domain, FluentValidation and Microsoft.Extensions
/// abstractions; Infrastructure never references Api; handlers are internal sealed and requests sealed.
/// </summary>
/// <remarks>
/// Uses compiled assembly references, so it only sees references that code actually uses (the compiler drops unused
/// ones). That is the property we care about: no type from a forbidden assembly is used.
/// </remarks>
public sealed partial class ArchitectureTests
{
    private const string ApiAssemblyName = "FleetConsole.Api";
    private const string DomainAssemblyName = "FleetConsole.Domain";
    private const string InfrastructureAssemblyName = "FleetConsole.Infrastructure";

    /// <summary>
    /// The base class library = assemblies shipped in the Microsoft.NETCore.App shared framework (the directory
    /// System.Private.CoreLib was loaded from). A name check like "starts with System" would also admit NuGet packages
    /// such as System.IO.Abstractions; ASP.NET Core and Microsoft.Extensions live in other frameworks/packages and are
    /// therefore excluded too.
    /// </summary>
    private static readonly HashSet<string> BclAssemblyNames =
        Directory.EnumerateFiles(Path.GetDirectoryName(typeof(object).Assembly.Location)!, "*.dll")
            .Select(Path.GetFileNameWithoutExtension)
            .OfType<string>()
            .ToHashSet(StringComparer.Ordinal);

    /// <summary>Third-party packages the Application layer may use (BACKEND.md).</summary>
    private static readonly HashSet<string> ApplicationAllowedPackages = new(StringComparer.Ordinal)
    {
        "FluentValidation",
        "FluentValidation.DependencyInjectionExtensions",
    };

    [Fact]
    public void BclPredicate_AcceptsFrameworkAssemblies_AndRejectsLookalikes()
    {
        IsBcl("System.Runtime").ShouldBeTrue();
        IsBcl("System.Collections").ShouldBeTrue();
        IsBcl("System.IO.Abstractions").ShouldBeFalse();
        IsBcl("Microsoft.Extensions.Logging.Abstractions").ShouldBeFalse();
        IsBcl("Microsoft.AspNetCore.Http.Abstractions").ShouldBeFalse();
    }

    [Fact]
    public void Domain_DoesNotReferenceOtherFleetConsoleLayers()
    {
        FleetConsoleReferencesOf(DomainAssembly.Assembly).ShouldBeEmpty();
    }

    [Fact]
    public void Domain_ReferencesOnlyTheBaseClassLibrary()
    {
        ReferencesOf(DomainAssembly.Assembly).Where(name => !IsBcl(name)).ShouldBeEmpty();
    }

    [Fact]
    public void Application_ReferencesOnlyDomainBclFluentValidationAndExtensionsAbstractions()
    {
        var disallowed = ReferencesOf(ApplicationAssembly.Assembly)
            .Where(name => !IsBcl(name)
                           && name != DomainAssemblyName
                           && !ApplicationAllowedPackages.Contains(name)
                           && !ExtensionsAbstractionsPattern().IsMatch(name));

        disallowed.ShouldBeEmpty();
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

    [Fact]
    public void ApplicationHandlers_AreInternalAndSealed()
    {
        var violations = ApplicationAssembly.Assembly.GetTypes()
            .Where(type => type is { IsClass: true, IsAbstract: false } && ImplementsOpenGeneric(type, typeof(IRequestHandler<,>)))
            .Where(type => type.IsPublic || type.IsNestedPublic || !type.IsSealed)
            .Select(type => type.FullName);

        violations.ShouldBeEmpty();
    }

    [Fact]
    public void ApplicationRequests_AreSealed()
    {
        var violations = ApplicationAssembly.Assembly.GetTypes()
            .Where(type => type is { IsClass: true, IsAbstract: false } && ImplementsOpenGeneric(type, typeof(IRequest<>)))
            .Where(type => !type.IsSealed)
            .Select(type => type.FullName);

        violations.ShouldBeEmpty();
    }

    /// <summary>Microsoft.Extensions.*.Abstractions, e.g. Logging.Abstractions, DependencyInjection.Abstractions.</summary>
    [GeneratedRegex(@"^Microsoft\.Extensions\.[A-Za-z.]+\.Abstractions$", RegexOptions.CultureInvariant)]
    private static partial Regex ExtensionsAbstractionsPattern();

    private static bool IsBcl(string assemblyName) => BclAssemblyNames.Contains(assemblyName);

    private static bool ImplementsOpenGeneric(Type type, Type openGeneric) =>
        type.GetInterfaces().Any(i => i.IsGenericType && i.GetGenericTypeDefinition() == openGeneric);

    private static string[] ReferencesOf(Assembly assembly) =>
        assembly.GetReferencedAssemblies().Select(a => a.Name!).ToArray();

    private static string[] FleetConsoleReferencesOf(Assembly assembly) =>
        ReferencesOf(assembly).Where(name => name.StartsWith("FleetConsole.", StringComparison.Ordinal)).ToArray();
}
