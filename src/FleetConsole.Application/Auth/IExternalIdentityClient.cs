using FleetConsole.Application.Abstractions;

namespace FleetConsole.Application.Auth;

/// <summary>
/// Port to the host cluster's identity endpoint (<c>GET /apis/user.openshift.io/v1/users/~</c>, ADR-0007/0010). The Api
/// calls it once per login, right after the OAuth code exchange, then discards the access token.
/// </summary>
/// <remarks>Implemented by <c>Infrastructure/Identity/OpenShiftUserClient</c>.</remarks>
public interface IExternalIdentityClient
{
    /// <summary>Asks the host API server who owns <paramref name="accessToken"/>.</summary>
    /// <param name="accessToken">The user's OpenShift OAuth access token. Used only for this call; never logged or stored.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The user's identity.</returns>
    /// <exception cref="ExternalIdentityUnavailableException">The host API server could not answer usefully: network or TLS
    /// failure, timeout, 5xx, or 401 (token not accepted). The login ends as <c>unavailable</c> (AUTH-14).</exception>
    /// <exception cref="InvalidOperationException">Any other unexpected response (other status, malformed body); the login
    /// ends as <c>failed</c>.</exception>
    Task<ExternalIdentity> GetCurrentUserAsync(SensitiveString accessToken, CancellationToken cancellationToken);
}
