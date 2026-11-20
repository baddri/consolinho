namespace FleetConsole.Application.Auth;

/// <summary>
/// The host cluster's identity endpoint could not be reached or refused the token (network, TLS, timeout, 5xx, 401).
/// Thrown by <see cref="IExternalIdentityClient"/>; the Api's OAuth failure handling turns it into
/// <c>/login?error=unavailable</c> (AUTH-14). Messages never contain the token.
/// </summary>
public sealed class ExternalIdentityUnavailableException : Exception
{
    /// <summary>Creates the exception with a generic message.</summary>
    public ExternalIdentityUnavailableException()
        : base("The host cluster's identity endpoint is unavailable.")
    {
    }

    /// <summary>Creates the exception with a message describing the failure (no secrets).</summary>
    /// <param name="message">What failed, e.g. the HTTP status.</param>
    public ExternalIdentityUnavailableException(string message)
        : base(message)
    {
    }

    /// <summary>Creates the exception with a message and the underlying network/TLS/timeout error.</summary>
    /// <param name="message">What failed (no secrets).</param>
    /// <param name="innerException">The underlying error.</param>
    public ExternalIdentityUnavailableException(string message, Exception? innerException)
        : base(message, innerException)
    {
    }
}
