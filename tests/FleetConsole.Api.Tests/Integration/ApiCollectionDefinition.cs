namespace FleetConsole.Api.Tests.Integration;

/// <summary>
/// xUnit collection that shares one <see cref="ApiFactory"/> (one Api host + one PostgreSQL container) across all
/// integration test classes. Mark integration test classes with <c>[Collection(ApiCollectionDefinition.Name)]</c> and take
/// <see cref="ApiFactory"/> as a constructor parameter.
/// </summary>
[CollectionDefinition(Name)]
public sealed class ApiCollectionDefinition : ICollectionFixture<ApiFactory>
{
    /// <summary>The collection name used in <c>[Collection]</c> attributes.</summary>
    public const string Name = "Api";
}
