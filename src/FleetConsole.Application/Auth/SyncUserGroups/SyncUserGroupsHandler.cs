using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Application.Auth.SyncUserGroups;

/// <summary>
/// Handles <see cref="SyncUserGroupsCommand"/>: replaces the user's recorded groups with the host's current membership,
/// or decides whether the session may continue when the host can't be read (ADR-0039 §3).
/// </summary>
/// <remarks>
/// <list type="bullet">
/// <item><b>Listing OK:</b> membership = the listing's groups containing the username (ordinal), minus virtual
/// <c>system:*</c> groups. <see cref="User.ReplaceGroups"/> changes the row (and raises <c>UserGroupsChanged</c>, audited
/// as <c>user.groups_changed</c> by the revalidation actor) only when the set differs; the check time is recorded
/// either way, through <see cref="IUserGroupCheckRecorder"/>, so an unchanged membership never touches <c>users</c>.</item>
/// <item><b>Listing not OK</b> (<see cref="HostGroupsStatus.Forbidden"/>/<see cref="HostGroupsStatus.Unavailable"/>):
/// fail closed only where stale data could widen access. If any recorded group is the subject of a grant →
/// <see cref="AuthErrors.GroupsUnavailable"/>; otherwise success without changes (stale membership grants nothing).</item>
/// </list>
/// <para>Logs the user id and the listing status only, never group names.</para>
/// </remarks>
internal sealed partial class SyncUserGroupsHandler(
    IUserRepository users,
    IHostGroupDirectory directory,
    IUserGroupCheckRecorder recorder,
    IReadModel readModel,
    ILogger<SyncUserGroupsHandler> logger) : IRequestHandler<SyncUserGroupsCommand, Result>
{
    /// <inheritdoc />
    public async Task<Result> Handle(SyncUserGroupsCommand request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var user = await users.GetByIdAsync(request.UserId, cancellationToken).ConfigureAwait(false);
        if (user is null)
        {
            return UserErrors.NotFound(request.UserId.Value.ToString());
        }

        var listing = await directory.GetAsync(cancellationToken).ConfigureAwait(false);
        if (listing.Status == HostGroupsStatus.Ok)
        {
            user.ReplaceGroups(OpenShiftGroups.WithoutVirtualGroups(listing.GroupsOf(user.Username.Value)));
            await recorder.RecordAsync(user.Id, listing.ReadAt!.Value, cancellationToken).ConfigureAwait(false);
            return Result.Success();
        }

        if (await RecordedGroupsCarryGrantsAsync(user, cancellationToken).ConfigureAwait(false))
        {
            Log.GroupsUnavailable(logger, user.Id.Value, listing.Status);
            return AuthErrors.GroupsUnavailable;
        }

        Log.GroupsKept(logger, user.Id.Value, listing.Status);
        return Result.Success();
    }

    /// <summary>Whether any of the user's recorded groups is the subject of a group grant (one SQL <c>EXISTS</c>).</summary>
    private async Task<bool> RecordedGroupsCarryGrantsAsync(User user, CancellationToken cancellationToken)
    {
        // A recorded name that isn't a valid GroupName can't be a grant subject, so skipping it is exact.
        var recorded = user.Groups
            .Select(GroupName.Create)
            .Where(name => name.IsSuccess)
            .Select(name => name.Value)
            .ToList();
        if (recorded.Count == 0)
        {
            return false;
        }

        var query = readModel.Grants.Where(g => g.SubjectKind == GrantSubjectKind.Group && recorded.Contains(g.GroupName!));
        return await readModel.AnyAsync(query, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Source-generated log messages (user id and listing status only; no group names).</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 2220, Level = LogLevel.Warning,
            Message = "Host groups of user {UserId} could not be read ({Status}) and their recorded groups carry grants; failing closed")]
        public static partial void GroupsUnavailable(ILogger logger, Guid userId, HostGroupsStatus status);

        [LoggerMessage(EventId = 2221, Level = LogLevel.Information,
            Message = "Host groups of user {UserId} could not be read ({Status}); no recorded group carries a grant, session kept")]
        public static partial void GroupsKept(ILogger logger, Guid userId, HostGroupsStatus status);
    }
}
