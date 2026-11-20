using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure.Crypto;

/// <summary>
/// Logs once at startup that the Data Protection key ring is stored unencrypted, outside Development, when no
/// key-encryption certificate is configured (ADR-0004, contract §12). Anyone who can read the database could then
/// decrypt the stored SA tokens and forge session cookies. CP3 turns this into a startup error.
/// </summary>
/// <param name="logger">The logger.</param>
internal sealed partial class UnprotectedKeyRingWarning(ILogger<UnprotectedKeyRingWarning> logger) : IHostedService
{
    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        LogUnprotected(logger, DataProtectionSetup.CertificatePathKey);
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    [LoggerMessage(EventId = 3200, Level = LogLevel.Warning,
        Message = "The Data Protection key ring is stored in the database without encryption. Set {ConfigurationKey} " +
                  "to a PFX certificate to protect SA tokens and session keys at rest (required from CP3).")]
    private static partial void LogUnprotected(ILogger logger, string configurationKey);
}
