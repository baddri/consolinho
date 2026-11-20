using FleetConsole.Api.Auth;
using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Auth;
using FleetConsole.Application.Auth.GetCurrentUser;
using FleetConsole.Application.Auth.LogOut;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints;

/// <summary>
/// <c>/api/auth</c>: starting a login, logging out, and describing the signed-in user (contract §4, AUTH-1..14). The
/// OAuth callback (<c>/api/auth/callback</c>) is not mapped here: the OpenShift OAuth handler answers it in the
/// authentication middleware (<see cref="OpenShiftLoginEvents"/>).
/// </summary>
/// <remarks>
/// <c>login</c> and <c>logout</c> are anonymous (ADR-0012's list; <c>AnonymousSurfaceTests</c> enforces it): the first
/// starts a session, the second must succeed without one. <c>GET</c> <c>login</c> only redirects and changes no state, so
/// it needs no CSRF header; <c>POST</c> <c>logout</c> does (CSRF middleware).
/// </remarks>
public static class AuthEndpoints
{
    /// <summary>Maps the auth endpoints under <paramref name="api"/> (the <c>/api</c> group).</summary>
    /// <param name="api">The <c>/api</c> route group.</param>
    /// <returns>The <c>/api/auth</c> group.</returns>
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder api)
    {
        var group = api.MapGroup("/auth").WithTags("Auth");

        group.MapGet("/login", Login)
            .WithName("Login")
            .Produces(StatusCodes.Status302Found)
            .AllowAnonymous();

        group.MapPost("/logout", Logout)
            .WithName("Logout")
            .AllowAnonymous();

        group.MapGet("/me", GetCurrentUser)
            .WithName("GetCurrentUser");

        return group;
    }

    // XML docs on the handlers are published as OpenAPI summaries (written for API consumers); implementation notes are
    // in // comments.

    /// <summary>
    /// Starts the OpenShift login: redirects the browser to the host cluster's OAuth server, or straight to the return URL
    /// when already signed in, or to /login?error=unavailable when the OAuth server can't be reached. Use as a full-page
    /// navigation, never with fetch.
    /// </summary>
    /// <param name="returnUrl">Local path to land on after login (e.g. /clusters); anything else is replaced by /.</param>
    /// <param name="httpContext">The current request.</param>
    /// <param name="metadataProvider">The host OAuth server's endpoints.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>A 302 redirect.</returns>
    internal static async Task<Results<RedirectHttpResult, ChallengeHttpResult>> Login(
        string? returnUrl,
        HttpContext httpContext,
        IOAuthServerMetadataProvider metadataProvider,
        CancellationToken cancellationToken)
    {
        var target = ReturnUrlPolicy.Sanitize(returnUrl);

        // A valid session (already revalidated by the cookie handler) makes the round trip pointless.
        if (SessionPrincipalFactory.TryRead(httpContext.User, out _))
        {
            return TypedResults.Redirect(target);
        }

        // Waits for discovery (bounded by the client timeout; at most one attempt per 10 s after a failure) so the
        // challenge never points at a placeholder endpoint (AUTH-14).
        var metadata = await metadataProvider.GetAsync(cancellationToken).ConfigureAwait(false);
        if (metadata is null)
        {
            return TypedResults.Redirect(LoginRedirect.ForError(LoginErrorCodes.Unavailable, target));
        }

        // The return URL travels inside the encrypted OAuth state and is sanitized again at the callback.
        return TypedResults.Challenge(new AuthenticationProperties { RedirectUri = target }, [OpenShiftOAuthOptions.Scheme]);
    }

    /// <summary>
    /// Ends the FleetConsole session and clears the session cookie. Always 204, also without a session. Does not log the
    /// user out of OpenShift.
    /// </summary>
    /// <param name="httpContext">The current request.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>204 No Content.</returns>
    internal static async Task<NoContent> Logout(HttpContext httpContext, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        // Audit (auth.logout) only for a real session; anonymous logout is a harmless no-op (contract §4.3). The
        // result is not checked: LogOutCommand only fails for anonymous callers, which this condition excludes, and a
        // failed audit save throws (500) rather than returning a result.
        if (SessionPrincipalFactory.TryRead(httpContext.User, out _))
        {
            await dispatcher.Send(new LogOutCommand(), cancellationToken).ConfigureAwait(false);
        }

        await httpContext.SignOutAsync(SessionDefaults.Scheme).ConfigureAwait(false);
        return TypedResults.NoContent();
    }

    /// <summary>Returns the signed-in user: name, role, read-only flag, groups and whether configuration makes them admin.</summary>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with <see cref="CurrentUserDto"/>, or 401 ProblemDetails when not signed in.</returns>
    internal static async Task<Results<Ok<CurrentUserDto>, ProblemHttpResult>> GetCurrentUser(
        IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new GetCurrentUserQuery(), cancellationToken).ConfigureAwait(false)).ToHttpResult();
}
