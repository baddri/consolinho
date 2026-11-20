using System.Net;

namespace FleetConsole.Api.Tests.Integration;

/// <summary>Small HTTP helpers shared by the integration test classes (one definition each, no copies per class).</summary>
internal static class ApiTestExtensions
{
    /// <summary>
    /// The status of <c>GET /api/auth/me</c> with <paramref name="client"/>'s cookies: 200 while the session is valid,
    /// 401 once it ended (logout, deactivation, revalidation failure).
    /// </summary>
    /// <param name="client">A browser client.</param>
    /// <returns>The status code.</returns>
    public static async Task<HttpStatusCode> MeStatusAsync(this HttpClient client)
    {
        using var response = await client.GetAsync(new Uri("/api/auth/me", UriKind.Relative), TestContext.Current.CancellationToken);
        return response.StatusCode;
    }
}
