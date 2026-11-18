using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace FleetConsole.Api.Tests;

/// <summary>
/// Complements <see cref="ArchitectureTests"/> by checking the layer rules from docs/architecture/BACKEND.md at the
/// project-file level, including the DevOAuth isolation rule (only the AppHost may reference the emulator; the emulator
/// references nothing but ServiceDefaults).
/// </summary>
/// <remarks>
/// <see cref="ArchitectureTests"/> reads compiled assembly references, which the compiler drops when no type is used.
/// A declared but unused package or framework reference (e.g. a Domain <c>PackageReference</c> nobody uses yet) is
/// therefore invisible to it, yet still flows transitively into every consumer and invites the first use. These tests
/// read the <c>.csproj</c> files so such references fail as soon as they are added (CP0 QA, spec criterion 2).
/// </remarks>
public sealed partial class ProjectFileArchitectureTests
{
    private const string DevOAuthProjectName = "FleetConsole.DevOAuth";

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

    /// <summary>
    /// AUTH-15 / SECURITY.md: the DevOAuth emulator is never deployed, so the Api (the only deployed project) must not
    /// reference it, directly or through another layer.
    /// </summary>
    [Fact]
    public void Api_DoesNotDeclareDevOAuthProjectReference()
    {
        ProjectReferenceNames(LoadProject("FleetConsole.Api")).ShouldNotContain(DevOAuthProjectName);
    }

    [Fact]
    public void OnlyTheAppHost_DeclaresDevOAuthProjectReference()
    {
        var referencing = Directory.EnumerateFiles(SourceRoot, "*.csproj", SearchOption.AllDirectories)
            .Where(path => ProjectReferenceNames(XDocument.Load(path)).Contains(DevOAuthProjectName))
            .Select(Path.GetFileNameWithoutExtension);

        referencing.ShouldBe(["FleetConsole.AppHost"]);
    }

    [Fact]
    public void DevOAuth_DeclaresOnlyServiceDefaultsProjectReference()
    {
        ProjectReferenceNames(LoadProject(DevOAuthProjectName)).ShouldBe(["FleetConsole.ServiceDefaults"]);
    }

    [GeneratedRegex(@"^Microsoft\.Extensions\.[A-Za-z.]+\.Abstractions$", RegexOptions.CultureInvariant)]
    private static partial Regex ExtensionsAbstractionsPattern();

    private static XDocument LoadProject(string name) =>
        XDocument.Load(Path.Combine(SourceRoot, name, $"{name}.csproj"));

    private static string[] ProjectReferenceNames(XDocument project) =>
        References(project, "ProjectReference")
            .Select(include => Path.GetFileNameWithoutExtension(include.Replace('\\', '/')))
            .ToArray();

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
