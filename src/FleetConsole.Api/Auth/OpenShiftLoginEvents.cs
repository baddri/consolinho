using System.Diagnostics;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Auth;
using FleetConsole.Application.Auth.CompleteLogin;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OAuth;

namespace FleetConsole.Api.Auth;

/// <summary>
/// The FleetConsole-specific steps of the OpenShift OAuth callback (ADR-0007/0010, contract §4.2): who the token
/// belongs to, whether that person may sign in, and where the browser goes in every outcome. Registered scoped and used
/// as the scheme's <c>EventsType</c>, so it gets request-scoped services by constructor injection.
/// </summary>
/// <remarks>
/// <para><b>Flow:</b> the framework validates state/correlation and redeems the code (PKCE) →
/// <see cref="CreatingTicket"/> asks the host's <c>users/~</c> who the access token belongs to and drops the token →
/// <see cref="TicketReceived"/> dispatches <see cref="CompleteLoginCommand"/> and either replaces the principal with the
/// FleetConsole session principal (the cookie handler then signs in and redirects to the return URL) or redirects to
/// <c>/login?error=…</c> without a session → any failure on the way ends in <see cref="RemoteFailure"/>, which redirects
/// to <c>/login?error=cancelled|unavailable|failed</c>.</para>
/// <para><b>Token hygiene (AUTH-3):</b> the access token exists only inside <see cref="CreatingTicket"/>, wrapped in
/// <see cref="SensitiveString"/>; <c>SaveTokens</c> is off and the session is issued with fresh
/// <see cref="AuthenticationProperties"/>, so nothing from the OAuth leg reaches the cookie. The external identity is
/// handed to the next event through <see cref="HttpContext.Items"/>, which dies with the request. Logs carry outcome,
/// exception type and trace id, never codes, tokens or messages from the remote side; the framework's own Information
/// log of the failure message (which can contain the remote <c>error_description</c>) is suppressed by
/// <see cref="WarningOnlyLoggerFactory"/>.</para>
/// </remarks>
/// <param name="identityClient">Asks the host cluster who the access token belongs to.</param>
/// <param name="dispatcher">Dispatches the login use case.</param>
/// <param name="logger">Logs failed and refused logins.</param>
internal sealed partial class OpenShiftLoginEvents(
    IExternalIdentityClient identityClient,
    IDispatcher dispatcher,
    ILogger<OpenShiftLoginEvents> logger) : OAuthEvents
{
    private static readonly object ExternalIdentityKey = new();
    private static readonly object ReturnUrlKey = new();

    /// <summary>
    /// Keeps the login's return URL for the rest of the request. The framework reports exceptions to
    /// <see cref="RemoteFailure"/> without the state's properties, so this is the only way to send the user back where
    /// they wanted to go after, e.g., an unreachable token endpoint.
    /// </summary>
    /// <param name="httpContext">The callback request.</param>
    /// <param name="properties">The properties restored from the OAuth state.</param>
    public static void RememberReturnUrl(HttpContext httpContext, AuthenticationProperties properties)
    {
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(properties);
        httpContext.Items[ReturnUrlKey] = properties.RedirectUri;
    }

    /// <summary>Resolves the identity behind the fresh access token (<c>users/~</c>) and then forgets the token.</summary>
    /// <param name="context">The ticket being created; its principal is a placeholder replaced in <see cref="TicketReceived"/>.</param>
    /// <returns>A task that completes when the identity is known.</returns>
    /// <exception cref="ExternalIdentityUnavailableException">Host unreachable/5xx/401 → handled as "unavailable".</exception>
    /// <exception cref="InvalidOperationException">Unexpected <c>users/~</c> response → handled as "failed".</exception>
    public override async Task CreatingTicket(OAuthCreatingTicketContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        RememberReturnUrl(context.HttpContext, context.Properties);

        // The framework rejects a token response without access_token before this event; guard anyway.
        if (string.IsNullOrEmpty(context.AccessToken))
        {
            throw new InvalidOperationException("The token response contained no access token.");
        }

        var identity = await identityClient
            .GetCurrentUserAsync(new SensitiveString(context.AccessToken), context.HttpContext.RequestAborted)
            .ConfigureAwait(false);
        context.HttpContext.Items[ExternalIdentityKey] = identity;
    }

    /// <summary>Decides the login (<see cref="CompleteLoginCommand"/>) and turns the outcome into a session or a redirect.</summary>
    /// <param name="context">The received ticket; <see cref="TicketReceivedContext.ReturnUri"/> is the requested return URL.</param>
    /// <returns>A task that completes when the outcome is applied.</returns>
    public override async Task TicketReceived(TicketReceivedContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        var httpContext = context.HttpContext;
        var returnUrl = ReturnUrlPolicy.Sanitize(context.ReturnUri);
        var traceId = TraceId(httpContext);

        if (httpContext.Items[ExternalIdentityKey] is not ExternalIdentity identity)
        {
            // CreatingTicket always stores it or throws; reaching this is a bug, but the user still gets a page.
            Log.LoginFailed(logger, LoginErrorCodes.Failed, "MissingExternalIdentity", traceId);
            Redirect(context, LoginRedirect.ForError(LoginErrorCodes.Failed, returnUrl));
            return;
        }

        var result = await dispatcher.Send(new CompleteLoginCommand(identity), httpContext.RequestAborted).ConfigureAwait(false);
        if (result.IsFailure)
        {
            // E.g. Persistence.DuplicateKey when two first logins of a new user race (T-0014): a retry succeeds.
            Log.LoginFailed(logger, LoginErrorCodes.Failed, result.Error.Code, traceId);
            Redirect(context, LoginRedirect.ForError(LoginErrorCodes.Failed, returnUrl));
            return;
        }

        var outcome = result.Value;
        switch (outcome.Decision)
        {
            case LoginDecision.Allowed when outcome.User is { } user:
                context.Principal = SessionPrincipalFactory.Create(
                    new SessionUser(user.UserId, user.Username, user.Role, user.IsReadOnly, user.SecurityStamp));

                // Fresh properties: nothing from the OAuth leg is carried into the session cookie. Persistent, so the
                // cookie has an expiry of Auth:SessionLifetime (AUTH-4) and survives a browser restart within it.
                context.Properties = new AuthenticationProperties { IsPersistent = true };
                context.ReturnUri = returnUrl;
                break;

            case LoginDecision.NotRegistered:
                Log.LoginRefused(logger, LoginErrorCodes.NotRegistered, traceId);
                Redirect(context, LoginRedirect.ForError(LoginErrorCodes.NotRegistered, returnUrl, identity.Username));
                break;

            case LoginDecision.Deactivated:
                Log.LoginRefused(logger, LoginErrorCodes.Deactivated, traceId);
                Redirect(context, LoginRedirect.ForError(LoginErrorCodes.Deactivated, returnUrl));
                break;

            default:
                // Allowed without a user, or a new decision value: fail closed.
                var cause = $"UnexpectedDecision:{outcome.Decision}";
                Log.LoginFailed(logger, LoginErrorCodes.Failed, cause, traceId);
                Redirect(context, LoginRedirect.ForError(LoginErrorCodes.Failed, returnUrl));
                break;
        }
    }

    /// <summary>
    /// Ends every failed callback on the login page (AUTH-14): <c>cancelled</c> when the user pressed Cancel,
    /// <c>unavailable</c> when the host OAuth server or <c>users/~</c> could not answer, else <c>failed</c>.
    /// </summary>
    /// <param name="context">The failure; <see cref="RemoteFailureContext.Properties"/> is null when the state was
    /// invalid or the failure was an exception.</param>
    /// <returns>A completed task.</returns>
    public override Task RemoteFailure(RemoteFailureContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        var httpContext = context.HttpContext;
        var error = Classify(context.Failure);
        var returnUrl = context.Properties?.RedirectUri ?? httpContext.Items[ReturnUrlKey] as string;
        var cause = context.Failure?.GetType().Name ?? "Unknown";
        var traceId = TraceId(httpContext);

        Log.LoginFailed(logger, error, cause, traceId);
        httpContext.Response.Redirect(LoginRedirect.ForError(error, returnUrl));
        context.HandleResponse();
        return Task.CompletedTask;
    }

    /// <summary>Maps a callback failure to a <see cref="LoginErrorCodes"/> value.</summary>
    /// <param name="failure">The failure reported by the OAuth handler.</param>
    /// <returns><c>cancelled</c>, <c>unavailable</c> or <c>failed</c>.</returns>
    internal static string Classify(Exception? failure)
    {
        // The OAuth server's error parameter (RFC 6749 §4.1.2.1), set by the framework on the failure's Data.
        var protocolError = failure?.Data["error"] as string;
        if (string.Equals(protocolError, "access_denied", StringComparison.Ordinal))
        {
            return LoginErrorCodes.Cancelled;
        }

        if (protocolError is "temporarily_unavailable" or "server_error")
        {
            return LoginErrorCodes.Unavailable;
        }

        for (var exception = failure; exception is not null; exception = exception.InnerException)
        {
            if (exception is ExternalIdentityUnavailableException or OAuthServerUnavailableException)
            {
                return LoginErrorCodes.Unavailable;
            }
        }

        return LoginErrorCodes.Failed;
    }

    private static void Redirect(TicketReceivedContext context, string location)
    {
        context.Response.Redirect(location);
        // No sign-in, no default redirect to the return URL.
        context.HandleResponse();
    }

    // Same value as the ProblemDetails traceId, so a support request can be matched to the log line.
    private static string TraceId(HttpContext httpContext) => Activity.Current?.Id ?? httpContext.TraceIdentifier;

    /// <summary>Source-generated log messages: outcome, error type/code and trace id only.</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 2200, Level = LogLevel.Warning,
            Message = "OpenShift login failed: outcome {Outcome}, cause {Cause}, trace id {TraceId}")]
        public static partial void LoginFailed(ILogger logger, string outcome, string cause, string traceId);

        [LoggerMessage(EventId = 2201, Level = LogLevel.Information,
            Message = "OpenShift login refused by FleetConsole: {Outcome}, trace id {TraceId}")]
        public static partial void LoginRefused(ILogger logger, string outcome, string traceId);
    }
}
