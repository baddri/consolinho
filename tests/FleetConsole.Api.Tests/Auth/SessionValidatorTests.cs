using System.Globalization;
using FleetConsole.Api.Auth;
using FleetConsole.Api.Tests.Identity;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Auth.GetSessionState;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace FleetConsole.Api.Tests.Auth;

/// <summary>
/// AUTH-11 / ADR-0009 rules of <see cref="SessionValidator"/> in isolation: when it checks, what ends a session, what a
/// refresh changes. The integration tests (<c>SessionRevalidationTests</c>) cover the same through HTTP.
/// </summary>
public sealed class SessionValidatorTests
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);

    private readonly ManualClock _clock = new();
    private readonly IDispatcher _dispatcher = Substitute.For<IDispatcher>();
    private readonly IAuthenticationService _authentication = Substitute.For<IAuthenticationService>();
    private readonly SessionUser _session = new(UserId.New(), "alice", UserRole.User, IsReadOnly: false, Guid.NewGuid());

    [Fact]
    public async Task WithinTheInterval_KeepsThePrincipal_WithoutReadingTheDatabase()
    {
        var context = CreateContext(SessionPrincipalFactory.Create(_session), validatedAt: _clock.UtcNow);
        _clock.Advance(Interval - TimeSpan.FromSeconds(1));

        await CreateValidator().ValidateAsync(context);

        context.Principal.ShouldNotBeNull();
        context.ShouldRenew.ShouldBeFalse();
        await _dispatcher.DidNotReceive().Send(Arg.Any<GetSessionStateQuery>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task AfterTheInterval_RefreshesRoleReadOnlyAndUsername_AndRenews()
    {
        var context = CreateContext(SessionPrincipalFactory.Create(_session), validatedAt: _clock.UtcNow);
        _clock.Advance(Interval);
        Returns(new SessionStateDto(_session.UserId, "alice2", UserRole.Admin, IsReadOnly: true, IsActive: true, _session.SecurityStamp));

        await CreateValidator().ValidateAsync(context);

        SessionPrincipalFactory.TryRead(context.Principal, out var refreshed).ShouldBeTrue();
        refreshed.ShouldBe(new SessionUser(_session.UserId, "alice2", UserRole.Admin, IsReadOnly: true, _session.SecurityStamp));
        context.ShouldRenew.ShouldBeTrue();
        context.Properties.Items[SessionValidator.ValidatedAtKey].ShouldBe(_clock.UtcNow.ToString("O", CultureInfo.InvariantCulture));
        await _authentication.DidNotReceive().SignOutAsync(Arg.Any<HttpContext>(), Arg.Any<string?>(), Arg.Any<AuthenticationProperties?>());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not a time")]
    [InlineData("2099-01-01T00:00:00.0000000+00:00")]
    public async Task MissingUnreadableOrFutureCheckTime_ChecksNow(string? validatedAt)
    {
        var context = CreateContext(SessionPrincipalFactory.Create(_session), validatedAt: null);
        if (validatedAt is not null)
        {
            context.Properties.Items[SessionValidator.ValidatedAtKey] = validatedAt;
        }

        Returns(new SessionStateDto(_session.UserId, "alice", UserRole.User, IsReadOnly: false, IsActive: true, _session.SecurityStamp));

        await CreateValidator().ValidateAsync(context);

        await _dispatcher.Received(1).Send(Arg.Is<GetSessionStateQuery>(q => q.UserId == _session.UserId), Arg.Any<CancellationToken>());
        context.ShouldRenew.ShouldBeTrue();
    }

    [Fact]
    public async Task IntervalZero_ChecksEveryRequest()
    {
        var context = CreateContext(SessionPrincipalFactory.Create(_session), validatedAt: _clock.UtcNow);
        Returns(new SessionStateDto(_session.UserId, "alice", UserRole.User, IsReadOnly: false, IsActive: true, _session.SecurityStamp));

        await CreateValidator(TimeSpan.Zero).ValidateAsync(context);

        await _dispatcher.Received(1).Send(Arg.Any<GetSessionStateQuery>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DeactivatedUser_IsRejectedAndSignedOut()
    {
        var context = CreateContext(SessionPrincipalFactory.Create(_session), validatedAt: null);
        Returns(new SessionStateDto(_session.UserId, "alice", UserRole.User, IsReadOnly: false, IsActive: false, _session.SecurityStamp));

        await CreateValidator().ValidateAsync(context);

        await ShouldBeRejectedAsync(context);
    }

    [Fact]
    public async Task ChangedSecurityStamp_IsRejected()
    {
        // Deactivate → reactivate rotates the stamp: the old session never comes back (ADR-0009).
        var context = CreateContext(SessionPrincipalFactory.Create(_session), validatedAt: null);
        Returns(new SessionStateDto(_session.UserId, "alice", UserRole.User, IsReadOnly: false, IsActive: true, Guid.NewGuid()));

        await CreateValidator().ValidateAsync(context);

        await ShouldBeRejectedAsync(context);
    }

    [Fact]
    public async Task MissingUser_IsRejected()
    {
        var context = CreateContext(SessionPrincipalFactory.Create(_session), validatedAt: null);
        _dispatcher.Send(Arg.Any<GetSessionStateQuery>(), Arg.Any<CancellationToken>())
            .Returns(Result.Failure<SessionStateDto>(UserErrors.NotFound(_session.UserId.Value.ToString())));

        await CreateValidator().ValidateAsync(context);

        await ShouldBeRejectedAsync(context);
    }

    [Fact]
    public async Task UnreadableSessionClaims_AreRejected_EvenWithinTheInterval()
    {
        // An authenticated cookie identity that ICurrentUser can't parse (old format, missing claim) must not survive:
        // otherwise endpoints would see a signed-in user that the pipeline treats as anonymous (T-0011 review).
        var principal = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
            [new System.Security.Claims.Claim(SessionClaims.Username, "alice")], SessionDefaults.Scheme));
        var context = CreateContext(principal, validatedAt: _clock.UtcNow);

        await CreateValidator().ValidateAsync(context);

        await ShouldBeRejectedAsync(context);
        await _dispatcher.DidNotReceive().Send(Arg.Any<GetSessionStateQuery>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public void MarkValidated_StoresTheClockTime()
    {
        var properties = new AuthenticationProperties();

        CreateValidator().MarkValidated(properties);

        properties.Items[SessionValidator.ValidatedAtKey].ShouldBe(_clock.UtcNow.ToString("O", CultureInfo.InvariantCulture));
    }

    private SessionValidator CreateValidator(TimeSpan? interval = null)
    {
        var options = Substitute.For<IOptionsMonitor<ConsoleSessionOptions>>();
        options.CurrentValue.Returns(new ConsoleSessionOptions { RevalidationInterval = interval ?? Interval });
        return new SessionValidator(_clock, options, NullLogger<SessionValidator>.Instance);
    }

    private void Returns(SessionStateDto state) =>
        _dispatcher.Send(Arg.Any<GetSessionStateQuery>(), Arg.Any<CancellationToken>()).Returns(Result.Success(state));

    private CookieValidatePrincipalContext CreateContext(System.Security.Claims.ClaimsPrincipal principal, DateTimeOffset? validatedAt)
    {
        var services = new ServiceCollection()
            .AddSingleton(_dispatcher)
            .AddSingleton(_authentication)
            .BuildServiceProvider();
        var httpContext = new DefaultHttpContext { RequestServices = services };
        var properties = new AuthenticationProperties();
        if (validatedAt is { } at)
        {
            properties.Items[SessionValidator.ValidatedAtKey] = at.ToString("O", CultureInfo.InvariantCulture);
        }

        var scheme = new AuthenticationScheme(SessionDefaults.Scheme, null, typeof(CookieAuthenticationHandler));
        return new CookieValidatePrincipalContext(
            httpContext, scheme, new CookieAuthenticationOptions(), new AuthenticationTicket(principal, properties, SessionDefaults.Scheme));
    }

    private async Task ShouldBeRejectedAsync(CookieValidatePrincipalContext context)
    {
        context.Principal.ShouldBeNull();
        await _authentication.Received(1).SignOutAsync(Arg.Any<HttpContext>(), SessionDefaults.Scheme, Arg.Any<AuthenticationProperties?>());
    }
}
