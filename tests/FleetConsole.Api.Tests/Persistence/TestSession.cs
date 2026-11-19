using FleetConsole.Api.Auth;
using FleetConsole.Domain.Users;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Api.Tests.Persistence;

/// <summary>
/// Gives persistence tests, which work below HTTP, an authenticated current user. Saving aggregates dispatches their
/// domain events to the audit handlers before the write (ADR-0008), and <c>AuditTrail</c> attributes admin actions to
/// <c>ICurrentUser</c>; without one, the save fails closed.
/// </summary>
/// <remarks>
/// Goes through the production path: <c>HttpCurrentUser</c> reads the session principal from
/// <see cref="IHttpContextAccessor"/>. The accessor stores the context in an <see cref="AsyncLocal{T}"/>; this method is
/// deliberately synchronous, so the value stays set for the rest of the calling (async) test method and is reverted when
/// that method completes. Tests in the integration collection run one at a time, so no request is in flight meanwhile.
/// </remarks>
internal static class TestSession
{
    /// <summary>Signs <paramref name="username"/> in (as an admin, for the current async flow) and creates a scope.</summary>
    /// <param name="services">The host's root service provider.</param>
    /// <param name="username">The acting admin's username (the audit actor).</param>
    /// <returns>A new scope whose <c>ICurrentUser</c> is <paramref name="username"/>.</returns>
    public static AsyncServiceScope CreateSignedInScope(this IServiceProvider services, string username = PersistenceTestData.Admin)
    {
        SignIn(services, username);
        return services.CreateAsyncScope();
    }

    /// <summary>Signs <paramref name="username"/> in for the current async flow; returns the acting user's id.</summary>
    /// <param name="services">The host's root service provider.</param>
    /// <param name="username">The acting admin's username.</param>
    /// <returns>The (random) user id in the session.</returns>
    public static UserId SignIn(IServiceProvider services, string username = PersistenceTestData.Admin)
    {
        var userId = UserId.New();
        services.GetRequiredService<IHttpContextAccessor>().HttpContext = new DefaultHttpContext
        {
            User = SessionPrincipalFactory.Create(new SessionUser(userId, username, UserRole.Admin, false, Guid.NewGuid())),
        };
        return userId;
    }
}
