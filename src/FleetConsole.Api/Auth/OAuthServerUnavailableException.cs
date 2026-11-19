namespace FleetConsole.Api.Auth;

/// <summary>
/// The host OAuth server's token endpoint could not be reached, timed out or answered with a server error while
/// redeeming the authorization code. Raised by <see cref="OpenShiftOAuthHandler"/>; <see cref="OpenShiftLoginEvents"/>
/// turns it into <c>/login?error=unavailable</c> (AUTH-14). Messages carry the status or error type, never the code,
/// secret or token.
/// </summary>
internal sealed class OAuthServerUnavailableException : Exception
{
    /// <summary>Creates the exception with a generic message.</summary>
    public OAuthServerUnavailableException()
        : base("The host OAuth server is unavailable.")
    {
    }

    /// <summary>Creates the exception with a message (no secrets).</summary>
    /// <param name="message">What failed.</param>
    public OAuthServerUnavailableException(string message)
        : base(message)
    {
    }

    /// <summary>Creates the exception with a message (no secrets) and the underlying network/timeout error.</summary>
    /// <param name="message">What failed.</param>
    /// <param name="innerException">The underlying error.</param>
    public OAuthServerUnavailableException(string message, Exception? innerException)
        : base(message, innerException)
    {
    }
}
