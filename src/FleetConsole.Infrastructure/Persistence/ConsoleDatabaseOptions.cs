namespace FleetConsole.Infrastructure.Persistence;

/// <summary>
/// The console database's connection string (<c>ConnectionStrings:consoledb</c>), as options only so that its presence
/// is validated on start in every environment (ADR-0028 §6) with a message naming the key, never the value. The
/// <see cref="ConsoleDbContext"/> registration still reads the configuration itself, lazily, when a context is created.
/// </summary>
internal sealed class ConsoleDatabaseOptions
{
    /// <summary>The configured connection string; required (validated on start).</summary>
    public string? ConnectionString { get; set; }

    /// <summary>The validation failure message.</summary>
    public const string MissingMessage = $"ConnectionStrings:{ConsoleDbContext.ConnectionName} is not configured.";
}
