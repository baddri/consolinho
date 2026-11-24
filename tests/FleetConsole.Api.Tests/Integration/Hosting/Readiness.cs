using System.Net;

namespace FleetConsole.Api.Tests.Integration.Hosting;

/// <summary>
/// Waits for a freshly started host to turn ready. Readiness includes the <c>keyring</c> check, which turns Healthy only
/// once the background key-ring warm-up has run (T-0231), so a probe sent right after start may legitimately see 503.
/// </summary>
public static class Readiness
{
    /// <summary>Upper bound for a host over a reachable database; the warm-up normally needs well under a second.</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Sends <c>GET <paramref name="path"/></c> until it no longer answers 503 or <see cref="Timeout"/> passes, and
    /// returns the last response (the caller asserts on it and disposes it).
    /// </summary>
    /// <param name="client">A client of the host.</param>
    /// <param name="path">The probe path, e.g. <c>/health</c>.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The first non-503 response, or the last 503 after the timeout.</returns>
    public static async Task<HttpResponseMessage> GetWhenReadyAsync(HttpClient client, string path, CancellationToken cancellationToken)
    {
        var deadline = DateTimeOffset.UtcNow + Timeout;
        while (true)
        {
            var response = await client.GetAsync(new Uri(path, UriKind.Relative), cancellationToken);
            if (response.StatusCode != HttpStatusCode.ServiceUnavailable || DateTimeOffset.UtcNow >= deadline)
            {
                return response;
            }

            response.Dispose();
            await Task.Delay(TimeSpan.FromMilliseconds(50), cancellationToken);
        }
    }
}
