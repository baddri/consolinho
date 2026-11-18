using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace FleetConsole.Api.Tests;

/// <summary>
/// Complements <see cref="ArchitectureTests"/> by checking the layer rules from docs/architecture/BACKEND.md at the
/// project-file level.
/// </summary>
/// <remarks>
/// <see cref="ArchitectureTests"/> reads compiled assembly references, which the compiler drops when no type is used.
/// A declared but unused package or framework reference (e.g. a Domain <c>PackageReference</c> nobody uses yet) is
/// therefore invisible to it, yet still flows transitively into every consumer and invites the first use. These tests
/// read the <c>.csproj</c> files so such references fail as soon as they are added (CP0 QA, spec criterion 2).
/// </remarks>
public sealed partial class ProjectFileArchitectureTests
{
    private static readonly string SourceRoot = Path.Combine(FindRepositoryRoot(), "src");

    [Fact]
    public void Domain_DeclaresNoProjectPackageOrFrameworkReferences()
    {
        var project = LoadProject("FleetConsole.Domain");

        References(project, "ProjectReference").ShouldBeEmpty();
        References(project, "PackageReference").ShouldBeEmpty();
        References(project, "FrameworkReference").ShouldBeEmpty();
    }

    [Fact]
    public void Application_DeclaresOnlyDomainProjectReference()
    {
        var project = LoadProject("FleetConsole.Application");

        References(project, "ProjectReference")
            .Select(include => Path.GetFileNameWithoutExtension(include.Replace('\\', '/')))
            .ShouldBe(["FleetConsole.Domain"]);
    }

    [Fact]
    public void Application_DeclaresOnlyAllowedPackages_AndNoFrameworkReference()
    {
        var project = LoadProject("FleetConsole.Application");

        References(project, "PackageReference")
            .Where(name => !name.StartsWith("FluentValidation", StringComparison.Ordinal)
                           && !ExtensionsAbstractionsPattern().IsMatch(name))
            .ShouldBeEmpty();
        References(project, "FrameworkReference").ShouldBeEmpty();
    }

    [Fact]
    public void Infrastructure_DoesNotDeclareApiProjectReference()
    {
        var project = LoadProject("FleetConsole.Infrastructure");

        References(project, "ProjectReference")
            .Select(include => Path.GetFileNameWithoutExtension(include.Replace('\\', '/')))
            .ShouldNotContain("FleetConsole.Api");
    }

    [GeneratedRegex(@"^Microsoft\.Extensions\.[A-Za-z.]+\.Abstractions$", RegexOptions.CultureInvariant)]
    private static partial Regex ExtensionsAbstractionsPattern();

    private static XDocument LoadProject(string name) =>
        XDocument.Load(Path.Combine(SourceRoot, name, $"{name}.csproj"));

    private static string[] References(XDocument project, string itemType) =>
        project.Descendants(itemType)
            .Select(item => (string?)item.Attribute("Include") ?? (string?)item.Attribute("Update") ?? string.Empty)
            .ToArray();

    private static string FindRepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "FleetConsole.slnx")))
            {
                return directory.FullName;
            }
        }

        throw new InvalidOperationException("FleetConsole.slnx not found above the test output directory.");
    }
}
