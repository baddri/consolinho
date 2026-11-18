using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Common;
using FleetConsole.Api.Http;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Auth;

/// <summary>
/// Registers how requests are authenticated and authorized (ADR-0009): the session cookie scheme as the default
/// scheme, API-friendly challenge/forbid responses, the <see cref="AuthorizationPolicies.Admin"/> policy and the
/// validated <see cref="ConsoleSessionOptions"/>. Pair with <c>UseAuthentication()</c>/<c>UseAuthorization()</c> after
/// <c>UseCsrfHeaderCheck()</c> in <c>Program</c>.
/// </summary>
/// <remarks>
/// T-0015 extends this file with the OpenShift OAuth handler (login/callback) and session revalidation
/// (<c>OnValidatePrincipal</c>).
/// </remarks>
public static class AuthenticationSetup
{
    /// <summary>Adds cookie authentication, authorization policies and session options.</summary>
    /// <param name="builder">The Api's application builder (configuration and environment decide cookie settings).</param>
    /// <returns>The same builder, for chaining.</returns>
    public static WebApplicationBuilder AddApiAuthentication(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Services.AddOptions<ConsoleSessionOptions>()
            .BindConfiguration(ConsoleSessionOptions.SectionName)
            .Validate(o => o.SessionLifetime > TimeSpan.Zero, "Auth:SessionLifetime must be positive.")
            .Validate(o => o.RevalidationInterval > TimeSpan.Zero, "Auth:RevalidationInterval must be positive.")
            .Validate(o => o.RevalidationInterval < o.SessionLifetime, "Auth:RevalidationInterval must be shorter than Auth:SessionLifetime.")
            .ValidateOnStart();

        builder.Services.AddAuthentication(SessionDefaults.Scheme).AddCookie(SessionDefaults.Scheme);

        // Configured through the options system so the validated ConsoleSessionOptions (and test overrides of them) apply.
        var isDevelopment = builder.Environment.IsDevelopment();
        builder.Services.AddOptions<CookieAuthenticationOptions>(SessionDefaults.Scheme)
            .Configure<IOptions<ConsoleSessionOptions>>((cookie, session) =>
            {
                cookie.Cookie.Name = SessionDefaults.CookieName;
                cookie.Cookie.HttpOnly = true;

                // Lax, not Strict: the OAuth callback is a cross-site top-level navigation that must carry the
                // correlation cookie and then set the session (ADR-0009). CSRF is handled by the header check.
                cookie.Cookie.SameSite = SameSiteMode.Lax;

                // Development's plain-http profile (aspire --launch-profile http) needs a non-Secure cookie.
                cookie.Cookie.SecurePolicy = isDevelopment ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
                cookie.ExpireTimeSpan = session.Value.SessionLifetime;
                cookie.SlidingExpiration = true;

                // The Api has no login page to redirect to: the SPA reacts to 401/403 itself (ADR-0014).
                cookie.Events.OnRedirectToLogin = context =>
                    WriteProblemAsync(context.HttpContext, AuthErrors.Unauthenticated);
                cookie.Events.OnRedirectToAccessDenied = context =>
                    WriteProblemAsync(context.HttpContext, AuthErrors.Forbidden);
            });

        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(AuthorizationPolicies.Admin, policy => policy
                .AddAuthenticationSchemes(SessionDefaults.Scheme)
                .RequireAuthenticatedUser()
                .RequireClaim(SessionClaims.Role, SessionClaims.AdminRoleValue));

        return builder;
    }

    // Same error codes and messages as the Application's AuthorizationBehavior, rendered through the central
    // Error → ProblemDetails mapping so the body (code, traceId, instance) matches every other API error.
    private static async Task WriteProblemAsync(HttpContext httpContext, Error error)
    {
        var problem = error.ToProblemDetails();
        httpContext.Response.StatusCode = problem.Status!.Value;

        var problemDetailsService = httpContext.RequestServices.GetRequiredService<IProblemDetailsService>();
        await problemDetailsService.WriteAsync(new ProblemDetailsContext { HttpContext = httpContext, ProblemDetails = problem })
            .ConfigureAwait(false);
    }
}
