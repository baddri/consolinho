using FleetConsole.Application.Auth;
using Microsoft.Extensions.Hosting;

namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// Starts one OAuth metadata load when the Api starts, so the first login usually finds the endpoints cached
/// (ADR-0010). Never blocks or fails startup: an unreachable host is only logged by the provider (AUTH-14).
/// </summary>
/// <param name="provider">The metadata provider to warm.</param>
internal sealed class OAuthMetadataWarmupService(IOAuthServerMetadataProvider provider) : BackgroundService
{
    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Yield first so StartAsync returns immediately even if the provider completes its synchronous part slowly.
        await Task.Yield();
        try
        {
            await provider.GetAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutdown during warm-up: nothing to do.
        }
    }
}
