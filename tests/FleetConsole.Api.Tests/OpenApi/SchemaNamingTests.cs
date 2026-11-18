using FleetConsole.Application;

namespace FleetConsole.Api.Tests.OpenApi;

/// <summary>
/// OpenApiSetup publishes <c>FooDto</c> as schema <c>Foo</c>. If a contract type named <c>Foo</c> also existed, both
/// would get the same schema id and one would silently replace the other in the document (BACKEND.md forbids it).
/// </summary>
public sealed class SchemaNamingTests
{
    [Fact]
    public void DtoTypes_DoNotCollideWithOtherTypes_AfterStrippingTheSuffix()
    {
        var contractTypes = new[] { ApplicationAssembly.Assembly, typeof(Program).Assembly }
            .SelectMany(assembly => assembly.GetExportedTypes())
            .ToArray();
        var dtoNames = contractTypes.Where(t => t.Name.Length > 3 && t.Name.EndsWith("Dto", StringComparison.Ordinal))
            .Select(t => t.Name[..^3])
            .ToArray();

        dtoNames.ShouldNotBeEmpty();
        dtoNames.ShouldBeUnique();
        contractTypes.Select(t => t.Name).Intersect(dtoNames, StringComparer.Ordinal).ShouldBeEmpty();
    }
}
