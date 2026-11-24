using System.Globalization;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Auth.GetSessionState;
using FleetConsole.Application.Auth.SyncUserGroups;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;

namespace FleetConsole.Api.Auth;

/// <summary>
/// Keeps sessions in step with the database (AUTH-11, ADR-0009): hooked to the cookie scheme's
/// <c>OnValidatePrincipal</c>, it re-reads the user at most every <see cref="ConsoleSessionOptions.RevalidationInterval"/>
/// and ends sessions of deactivated users and of users whose security stamp changed; otherwise it re-reads the user's
/// host group membership (<see cref="SyncUserGroupsCommand"/>, PREC-1, ADR-0039) and refreshes the role, read-only flag
/// and username claims.
/// </summary>
/// <remarks>
/// <para><b>When it checks:</b> the time of the last check is stored in the ticket's
/// <see cref="AuthenticationProperties.Items"/> under <see cref="ValidatedAtKey"/>; sign-in sets it
/// (<see cref="MarkValidated"/>, because a login has just read the user). A missing or unreadable value, or one in the
/// future, means "check now". An interval of zero checks every request (used by tests).</para>
/// <para><b>Rejecting</b> = <c>RejectPrincipal()</c> + sign-out: the request continues anonymous (protected endpoints
/// answer 401) and the browser drops the cookie. A principal whose session claims can't be parsed is rejected too, so
/// the endpoint layer and <c>ICurrentUser</c> never disagree about whether someone is signed in.</para>
/// <para><b>Groups:</b> read through FleetConsole's host ServiceAccount (never the user's token, which is not kept). If
/// the host can't be read and the user's recorded groups carry grants, the session ends (fail closed); users with only
/// direct grants keep their session. A host-side removal therefore takes effect within the revalidation interval plus
/// <c>Auth:HostGroups:MaxSnapshotAge</c>.</para>
/// <para><b>Refreshing</b> replaces the principal and renews the cookie (<c>ShouldRenew</c>), which also slides its
/// expiry. Singleton; the dispatcher is resolved from the request's services only when a check is due.</para>
/// </remarks>
/// <param name="clock">The time source for the interval.</param>
/// <param name="options">The revalidation interval.</param>
/// <param name="logger">Logs ended sessions (user id and reason only).</param>
internal sealed partial class SessionValidator(
    IClock clock,
    IOptionsMonitor<ConsoleSessionOptions> options,
    ILogger<SessionValidator> logger)
{
    /// <summary>Key of the last-check time (ISO 8601 round-trip format) in the ticket's properties.</summary>
    public const string ValidatedAtKey = "fc.validated";

    /// <summary>Records "checked now" on a ticket that is being signed in (the login has just read the user).</summary>
    /// <param name="properties">The properties of the ticket being issued.</param>
    public void MarkValidated(AuthenticationProperties properties)
    {
        ArgumentNullException.ThrowIfNull(properties);
        properties.Items[ValidatedAtKey] = clock.UtcNow.ToString("O", CultureInfo.InvariantCulture);
    }

    /// <summary>Validates the session of the current request; see the class remarks for the rules.</summary>
    /// <param name="context">The cookie handler's validation context.</param>
    /// <returns>A task that completes when the principal is kept, refreshed or rejected.</returns>
    public async Task ValidateAsync(CookieValidatePrincipalContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (!SessionPrincipalFactory.TryRead(context.Principal, out var session))
        {
            Log.SessionEnded(logger, Guid.Empty, "malformed session claims");
            await RejectAsync(context).ConfigureAwait(false);
            return;
        }

        var now = clock.UtcNow;
        if (!IsDue(context.Properties, now))
        {
            return;
        }

        var dispatcher = context.HttpContext.RequestServices.GetRequiredService<IDispatcher>();
        var result = await dispatcher.Send(new GetSessionStateQuery(session.UserId), context.HttpContext.RequestAborted)
            .ConfigureAwait(false);

        // Users.NotFound (or any other failure) → no basis for the session: fail closed.
        if (result.IsFailure)
        {
            Log.SessionEnded(logger, session.UserId.Value, result.Error.Code);
            await RejectAsync(context).ConfigureAwait(false);
            return;
        }

        var state = result.Value;
        if (!state.IsActive || state.SecurityStamp != session.SecurityStamp)
        {
            var reason = state.IsActive ? "security stamp changed" : "user deactivated";
            Log.SessionEnded(logger, session.UserId.Value, reason);
            await RejectAsync(context).ConfigureAwait(false);
            return;
        }

        var groups = await SyncGroupsAsync(context.HttpContext, state.UserId).ConfigureAwait(false);
        if (groups.IsFailure)
        {
            // Auth.GroupsUnavailable: the host can't be read and stale groups could keep removed access (ADR-0039 §3).
            Log.SessionEnded(logger, session.UserId.Value, "host groups unavailable");
            await RejectAsync(context).ConfigureAwait(false);
            return;
        }

        context.ReplacePrincipal(SessionPrincipalFactory.Create(
            new SessionUser(state.UserId, state.Username, state.Role, state.IsReadOnly, state.SecurityStamp)));
        context.Properties.Items[ValidatedAtKey] = now.ToString("O", CultureInfo.InvariantCulture);
        context.ShouldRenew = true;
    }

    /// <summary>
    /// Dispatches <see cref="SyncUserGroupsCommand"/> in a scope of its own, retrying once after a commit race.
    /// </summary>
    /// <remarks>
    /// The own scope keeps the request's <c>DbContext</c> clean: a failed commit leaves its entities tracked and the
    /// context unusable, and a tracked, modified user would otherwise leak into the endpoint's command. The retry covers
    /// parallel requests of one session revalidating together: both see the same membership change, one commits, the
    /// other hits a stale <c>xmin</c>; re-running it in a fresh scope finds the groups already current and succeeds,
    /// instead of signing the user out.
    /// </remarks>
    private static async Task<Result> SyncGroupsAsync(HttpContext httpContext, UserId userId)
    {
        var scopes = httpContext.RequestServices.GetRequiredService<IServiceScopeFactory>();
        Result result = Result.Success();
        for (var attempt = 0; attempt < 2; attempt++)
        {
            await using var scope = scopes.CreateAsyncScope();
            result = await scope.ServiceProvider.GetRequiredService<IDispatcher>()
                .Send(new SyncUserGroupsCommand(userId), httpContext.RequestAborted)
                .ConfigureAwait(false);
            if (result.IsSuccess || result.Error.Code != PersistenceErrors.ConcurrencyConflict.Code)
            {
                return result;
            }
        }

        return result;
    }

    private bool IsDue(AuthenticationProperties properties, DateTimeOffset now)
    {
        if (!properties.Items.TryGetValue(ValidatedAtKey, out var value)
            || !DateTimeOffset.TryParseExact(value, "O", CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var validatedAt)
            || validatedAt > now)
        {
            return true;
        }

        return now - validatedAt >= options.CurrentValue.RevalidationInterval;
    }

    private static async Task RejectAsync(CookieValidatePrincipalContext context)
    {
        context.RejectPrincipal();
        await context.HttpContext.SignOutAsync(SessionDefaults.Scheme).ConfigureAwait(false);
    }

    /// <summary>Source-generated log messages (no claims besides the user id).</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 2210, Level = LogLevel.Information, Message = "Session of user {UserId} ended by revalidation: {Reason}")]
        public static partial void SessionEnded(ILogger logger, Guid userId, string reason);
    }
}
