using FleetConsole.Application.Abstractions;
using FleetConsole.Domain.Common;
using FleetConsole.Api.Http;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Auth;

/// <summary>
/// Registers how requests are authenticated and authorized (ADR-0009/0010): the session cookie scheme as the default
/// scheme with revalidation (<see cref="SessionValidator"/>), API-friendly challenge/forbid responses, the
/// <see cref="AuthorizationPolicies.Admin"/> policy, the validated <see cref="ConsoleSessionOptions"/>, and the
/// OpenShift OAuth scheme that creates sessions. Pair with <c>UseAuthentication()</c>/<c>UseAuthorization()</c> after
/// <c>UseCsrfHeaderCheck()</c> in <c>Program</c>.
/// </summary>
/// <remarks>
/// Two methods on purpose: <see cref="AddApiAuthentication"/> (sessions) works on its own, e.g. for minimal test hosts,
/// while <see cref="AddOpenShiftLogin"/> needs the host-cluster adapters of <c>AddOpenShiftIdentity()</c> and
/// <c>Console:PublicOrigin</c>.
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
            .Validate(o => o.RevalidationInterval >= TimeSpan.Zero, "Auth:RevalidationInterval must not be negative.")
            .Validate(o => o.RevalidationInterval < o.SessionLifetime, "Auth:RevalidationInterval must be shorter than Auth:SessionLifetime.")
            .ValidateOnStart();

        builder.Services.AddAuthentication(SessionDefaults.Scheme).AddCookie(SessionDefaults.Scheme);
        builder.Services.AddSingleton<SessionValidator>();

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

                // Revalidation against the database (AUTH-11). Every sign-in follows a login that has just read the
                // user, so it counts as a check.
                cookie.Events.OnValidatePrincipal = context =>
                    context.HttpContext.RequestServices.GetRequiredService<SessionValidator>().ValidateAsync(context);
                cookie.Events.OnSigningIn = context =>
                {
                    context.HttpContext.RequestServices.GetRequiredService<SessionValidator>().MarkValidated(context.Properties);
                    return Task.CompletedTask;
                };
            });

        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(AuthorizationPolicies.Admin, policy => policy
                .AddAuthenticationSchemes(SessionDefaults.Scheme)
                .RequireAuthenticatedUser()
                .RequireClaim(SessionClaims.Role, SessionClaims.AdminRoleValue));

        return builder;
    }

    /// <summary>
    /// Adds the <see cref="OpenShiftOAuthOptions.Scheme"/> scheme (ADR-0010): authorization code + PKCE against the host
    /// cluster's OAuth server, callback <see cref="OpenShiftOAuthOptions.CallbackPathValue"/>, signing in to the session
    /// cookie scheme. Call after <see cref="AddApiAuthentication"/>, <c>AddOpenShiftIdentity()</c> and
    /// <c>AddPublicOrigin()</c>.
    /// </summary>
    /// <param name="builder">The Api's application builder.</param>
    /// <returns>The same builder, for chaining.</returns>
    public static WebApplicationBuilder AddOpenShiftLogin(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        var isDevelopment = builder.Environment.IsDevelopment();

        builder.Services.AddScoped<OpenShiftLoginEvents>();
        builder.Services.AddSingleton<IConfigureOptions<OpenShiftOAuthOptions>, OpenShiftOAuthOptionsSetup>();

        builder.Services.AddAuthentication()
            .AddOAuth<OpenShiftOAuthOptions, OpenShiftOAuthHandler>(OpenShiftOAuthOptions.Scheme, "OpenShift", options =>
            {
                options.SignInScheme = SessionDefaults.Scheme;
                options.EventsType = typeof(OpenShiftLoginEvents);

                // The correlation cookie must come back with the callback, a top-level cross-site GET from the OAuth
                // server: Lax suffices (the default None would also require Secure, which the plain-http dev profile
                // can't send). Same Secure rule as the session cookie.
                options.CorrelationCookie.SameSite = SameSiteMode.Lax;
                options.CorrelationCookie.SecurePolicy = isDevelopment ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            });

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
