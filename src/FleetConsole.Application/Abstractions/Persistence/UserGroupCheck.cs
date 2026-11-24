using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// When a user's host group membership was last read (login or session revalidation): the "groups as of" time that
/// effective-access views show next to <see cref="User.Groups"/> (EFF-4). One row per user in
/// <c>user_group_checks</c>.
/// </summary>
/// <remarks>
/// Deliberately <b>not</b> part of the <see cref="User"/> aggregate (ADR-0039 §4): it changes every revalidation interval
/// per active user, and writing it to the <c>users</c> row would bump the user's <c>xmin</c> concurrency token and make
/// admin edits fail with stale versions. Written only through <see cref="IUserGroupCheckRecorder"/>; read through
/// <c>IReadModel.UserGroupChecks</c>.
/// </remarks>
/// <param name="UserId">The user (primary key; foreign key to <c>users</c>).</param>
/// <param name="CheckedAt">When the membership was read from the host.</param>
public sealed record UserGroupCheck(UserId UserId, DateTimeOffset CheckedAt);
