using System.Security.Claims;
using FleetConsole.Api.Auth;
using FleetConsole.Domain.Users;
using Microsoft.AspNetCore.Http;

namespace FleetConsole.Api.Tests.Auth;

public sealed class HttpCurrentUserTests
{
    [Fact]
    public void SessionPrincipal_ExposesTheSessionUser()
    {
        var session = new SessionUser(UserId.New(), "alice", UserRole.Admin, IsReadOnly: true, Guid.NewGuid());
        var currentUser = CreateFor(SessionPrincipalFactory.Create(session));

        currentUser.IsAuthenticated.ShouldBeTrue();
        currentUser.UserId.ShouldBe(session.UserId);
        currentUser.Username.ShouldBe("alice");
        currentUser.IsReadOnly.ShouldBeTrue();
        currentUser.IsInRole(UserRole.Admin).ShouldBeTrue();
        currentUser.IsInRole(UserRole.User).ShouldBeFalse();
    }

    [Fact]
    public void AnonymousRequest_IsUnauthenticated()
    {
        var currentUser = CreateFor(new ClaimsPrincipal(new ClaimsIdentity()));

        ShouldBeAnonymous(currentUser);
    }

    [Fact]
    public void NoHttpContext_IsUnauthenticated()
    {
        var currentUser = new HttpCurrentUser(new HttpContextAccessor());

        ShouldBeAnonymous(currentUser);
    }

    [Fact]
    public void MalformedSessionClaims_AreUnauthenticated()
    {
        // Authenticated identity, but the role claim is garbage: no half identity reaches the Application layer.
        var claims = SessionPrincipalFactory.Create(new SessionUser(UserId.New(), "alice", UserRole.Admin, false, Guid.NewGuid()))
            .Claims.Where(c => c.Type != SessionClaims.Role)
            .Append(new Claim(SessionClaims.Role, "root"));
        var currentUser = CreateFor(new ClaimsPrincipal(new ClaimsIdentity(claims, SessionDefaults.Scheme)));

        ShouldBeAnonymous(currentUser);
    }

    [Fact]
    public void ReplacedPrincipal_IsReadAgain()
    {
        // Sign-in/revalidation replace HttpContext.User during a request; the cached parse must follow.
        var context = new DefaultHttpContext();
        var currentUser = new HttpCurrentUser(new HttpContextAccessor { HttpContext = context });
        currentUser.IsAuthenticated.ShouldBeFalse();

        context.User = SessionPrincipalFactory.Create(new SessionUser(UserId.New(), "bob", UserRole.User, false, Guid.NewGuid()));

        currentUser.IsAuthenticated.ShouldBeTrue();
        currentUser.Username.ShouldBe("bob");
    }

    private static HttpCurrentUser CreateFor(ClaimsPrincipal principal) =>
        new(new HttpContextAccessor { HttpContext = new DefaultHttpContext { User = principal } });

    private static void ShouldBeAnonymous(HttpCurrentUser currentUser)
    {
        currentUser.IsAuthenticated.ShouldBeFalse();
        currentUser.UserId.ShouldBeNull();
        currentUser.Username.ShouldBeNull();
        currentUser.IsReadOnly.ShouldBeFalse();
        currentUser.IsInRole(UserRole.Admin).ShouldBeFalse();
        currentUser.IsInRole(UserRole.User).ShouldBeFalse();
    }
}
