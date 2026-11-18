using System.Security.Claims;
using FleetConsole.Api.Auth;
using FleetConsole.Domain.Users;

namespace FleetConsole.Api.Tests.Auth;

public sealed class SessionPrincipalFactoryTests
{
    private static readonly SessionUser Alice =
        new(UserId.New(), "alice@example.com", UserRole.Admin, IsReadOnly: true, SecurityStamp: Guid.NewGuid());

    [Theory]
    [InlineData(UserRole.Admin, true)]
    [InlineData(UserRole.Admin, false)]
    [InlineData(UserRole.User, true)]
    [InlineData(UserRole.User, false)]
    public void CreateThenTryRead_RoundTrips(UserRole role, bool isReadOnly)
    {
        var user = Alice with { Role = role, IsReadOnly = isReadOnly };

        SessionPrincipalFactory.TryRead(SessionPrincipalFactory.Create(user), out var read).ShouldBeTrue();

        read.ShouldBe(user);
    }

    [Fact]
    public void Create_WritesTheAdr0009Claims()
    {
        var principal = SessionPrincipalFactory.Create(Alice);

        principal.Claims.Select(c => (c.Type, c.Value)).ShouldBe(
        [
            ("fc:uid", Alice.UserId.Value.ToString("D")),
            ("name", "alice@example.com"),
            ("role", "admin"),
            ("fc:ro", "true"),
            ("fc:stamp", Alice.SecurityStamp.ToString("D")),
        ], ignoreOrder: true);
        principal.Identity!.IsAuthenticated.ShouldBeTrue();
        principal.Identity.AuthenticationType.ShouldBe(SessionDefaults.Scheme);
        principal.Identity.Name.ShouldBe("alice@example.com");
        principal.IsInRole("admin").ShouldBeTrue();
    }

    [Fact]
    public void Create_UserRole_WritesUserClaimValue()
    {
        var principal = SessionPrincipalFactory.Create(Alice with { Role = UserRole.User });

        principal.FindFirst(SessionClaims.Role)!.Value.ShouldBe("user");
    }

    [Fact]
    public void TryRead_Null_ReturnsFalse() =>
        SessionPrincipalFactory.TryRead(null, out _).ShouldBeFalse();

    [Fact]
    public void TryRead_UnauthenticatedIdentityWithValidClaims_ReturnsFalse()
    {
        // Same claims, but no authentication type → not a session.
        var principal = new ClaimsPrincipal(new ClaimsIdentity(SessionPrincipalFactory.Create(Alice).Claims));

        SessionPrincipalFactory.TryRead(principal, out _).ShouldBeFalse();
    }

    public static TheoryData<string, string?> MalformedClaims => new()
    {
        // claim type, replacement value (null = remove the claim)
        { SessionClaims.UserId, null },
        { SessionClaims.UserId, "not-a-guid" },
        { SessionClaims.UserId, Guid.Empty.ToString("D") },
        { SessionClaims.Username, null },
        { SessionClaims.Username, " " },
        { SessionClaims.Role, null },
        { SessionClaims.Role, "Admin" },
        { SessionClaims.Role, "1" },
        { SessionClaims.Role, "superuser" },
        { SessionClaims.ReadOnly, null },
        { SessionClaims.ReadOnly, "True" },
        { SessionClaims.ReadOnly, "yes" },
        { SessionClaims.SecurityStamp, null },
        { SessionClaims.SecurityStamp, "stamp" },
    };

    [Theory]
    [MemberData(nameof(MalformedClaims))]
    public void TryRead_MissingOrMalformedClaim_ReturnsFalse(string claimType, string? value)
    {
        var claims = SessionPrincipalFactory.Create(Alice).Claims.Where(c => c.Type != claimType).ToList();
        if (value is not null)
        {
            claims.Add(new Claim(claimType, value));
        }

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, SessionDefaults.Scheme, SessionClaims.Username, SessionClaims.Role));

        SessionPrincipalFactory.TryRead(principal, out var user).ShouldBeFalse();
        user.ShouldBeNull();
    }

    [Fact]
    public void TryRead_DuplicatedRoleClaimInSecondIdentity_ReturnsFalse()
    {
        // Two role claims would let IsInRole("admin") and the parsed role disagree.
        var principal = SessionPrincipalFactory.Create(Alice with { Role = UserRole.User });
        principal.AddIdentity(new ClaimsIdentity([new Claim(SessionClaims.Role, "admin")], "other"));

        SessionPrincipalFactory.TryRead(principal, out _).ShouldBeFalse();
    }
}
