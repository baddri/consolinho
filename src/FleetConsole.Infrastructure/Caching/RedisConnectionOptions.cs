namespace FleetConsole.Infrastructure.Caching;

/// <summary>
/// Presence check of <c>ConnectionStrings:redis</c> (ADR-0040 §7): required outside Development, where several replicas
/// need the shared L2 and the backplane; optional in Development and tests (the cache is then L1-only). Validated on
/// start like <c>ConsoleDatabaseOptions</c>.
/// </summary>
internal sealed class RedisConnectionOptions
{
    /// <summary>
    /// The connection-string name; a contract with the AppHost (<c>AddRedis("redis")</c> injects
    /// <c>ConnectionStrings__redis</c>) and the kustomize manifests.
    /// </summary>
    public const string ConnectionName = "redis";

    /// <summary>The validation failure message; names the key, never a value.</summary>
    public const string MissingMessage = $"ConnectionStrings:{ConnectionName} is required outside Development.";

    /// <summary>The configured connection string, if any.</summary>
    public string? ConnectionString { get; set; }

    /// <summary>Whether the host runs in Development, where the connection string is optional.</summary>
    public bool IsDevelopment { get; set; }

    /// <summary>Whether the configuration is acceptable for the environment.</summary>
    /// <returns><see langword="true"/> when a connection string is set or the host runs in Development.</returns>
    public bool IsValid() => IsDevelopment || !string.IsNullOrWhiteSpace(ConnectionString);
}
