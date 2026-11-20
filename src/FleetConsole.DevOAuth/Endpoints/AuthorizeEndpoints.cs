using FleetConsole.DevOAuth.Configuration;
using FleetConsole.DevOAuth.OAuth;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace FleetConsole.DevOAuth.Endpoints;

/// <summary>
/// <c>/oauth/authorize</c>: the browser leg of the authorization code flow. GET shows the user picker; POST turns the
/// picked user (or Cancel) into a redirect back to the client, like OpenShift after login and grant approval.
/// </summary>
internal static partial class AuthorizeEndpoints
{
    /// <summary>OAuth's standard text for <c>access_denied</c>, as returned by OpenShift when the user denies.</summary>
    private const string AccessDeniedDescription = "The resource owner or authorization server denied the request.";

    /// <summary>Validates the query string and renders the picker, or the 400 page for an invalid request.</summary>
    /// <param name="request">The current request; parameters are read from its query string.</param>
    /// <param name="options">Clients (for validation) and users (for the buttons).</param>
    /// <returns>200 picker or 400 error page.</returns>
    public static IResult HandleGet(HttpRequest request, IOptions<DevOAuthOptions> options)
    {
        var config = options.Value;
        return AuthorizationRequest.TryParse(name => request.Query[name], config, out var authorization, out var error)
            ? AuthorizePage.Picker(authorization, config.Users)
            : AuthorizePage.Error(error);
    }

    /// <summary>
    /// Handles a picker form: re-validates the carried parameters, then redirects to the client's
    /// <c>redirect_uri</c> with a new code (user picked) or with <c>error=access_denied</c> (Cancel). <c>state</c> is
    /// echoed in both cases.
    /// </summary>
    /// <remarks>
    /// The form is read with <see cref="HttpRequest.ReadFormAsync"/> instead of parameter binding: minimal API form
    /// binding switches on antiforgery validation, and this dev-only page has no session to protect (OpenShift's own
    /// login page has CSRF protection; the Api's PKCE + state checks are what matter for the flow).
    /// </remarks>
    /// <param name="request">The current request (an <c>application/x-www-form-urlencoded</c> post).</param>
    /// <param name="options">Clients and users.</param>
    /// <param name="store">Issues the authorization code.</param>
    /// <param name="loggerFactory">For the issued-code log line (never contains the code).</param>
    /// <returns>302 to the client, or the 400 error page.</returns>
    public static async Task<IResult> HandlePostAsync(
        HttpRequest request,
        IOptions<DevOAuthOptions> options,
        DevOAuthStore store,
        ILoggerFactory loggerFactory)
    {
        if (!request.HasFormContentType)
        {
            return AuthorizePage.Error("Expected a form post.");
        }

        var form = await request.ReadFormAsync(request.HttpContext.RequestAborted).ConfigureAwait(false);
        var config = options.Value;
        if (!AuthorizationRequest.TryParse(name => form[name], config, out var authorization, out var error))
        {
            return AuthorizePage.Error(error);
        }

        if (string.Equals(form["cancel"], "1", StringComparison.Ordinal))
        {
            return RedirectToClient(authorization, new()
            {
                ["error"] = "access_denied",
                ["error_description"] = AccessDeniedDescription,
            });
        }

        var userName = form["username"].ToString();
        var user = config.Users.FirstOrDefault(u => string.Equals(u.Name, userName, StringComparison.Ordinal));
        if (user is null)
        {
            return AuthorizePage.Error("Unknown user.");
        }

        var code = store.IssueCode(
            authorization.Client.ClientId,
            authorization.RedirectUri,
            authorization.Scope,
            authorization.CodeChallenge,
            authorization.CodeChallengeMethod,
            user.Name);
        var logger = loggerFactory.CreateLogger(typeof(AuthorizeEndpoints));
        LogCodeIssued(logger, user.Name, authorization.Client.ClientId);

        return RedirectToClient(authorization, new() { ["code"] = code });
    }

    /// <summary>302 to <c>redirect_uri</c> with the given parameters (+ <c>state</c> when the client sent one).</summary>
    private static RedirectHttpResult RedirectToClient(AuthorizationRequest authorization, Dictionary<string, string?> parameters)
    {
        if (authorization.State is not null)
        {
            parameters["state"] = authorization.State;
        }

        // AddQueryString keeps any query the redirect_uri already has and URL-encodes the values.
        return TypedResults.Redirect(QueryHelpers.AddQueryString(authorization.RedirectUri, parameters));
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Issued an authorization code for user {UserName} to client {ClientId}")]
    private static partial void LogCodeIssued(ILogger logger, string userName, string clientId);
}
