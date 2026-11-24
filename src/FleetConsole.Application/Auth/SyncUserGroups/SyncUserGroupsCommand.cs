using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Auth.SyncUserGroups;

/// <summary>
/// Re-reads a user's host group membership through FleetConsole's host ServiceAccount and records it on the user
/// (PREC-1, ADR-0039 §3). Dispatched by the Api's <c>SessionValidator</c> on every due revalidation, after
/// <c>GetSessionStateQuery</c> has confirmed the session; failure ends the session.
/// </summary>
/// <remarks>
/// Deliberately <b>not</b> <see cref="IRequireAuthenticated"/> (it runs inside cookie validation, before
/// <c>HttpContext.User</c> is set), not <see cref="IAdminRequest"/>, and not <see cref="IMutatingCommand"/>: read-only
/// users must be synced too, so <c>ReadOnlyGuardBehavior</c> must not stop it. Never mapped to an endpoint (same rule as
/// <c>GetSessionStateQuery</c>, ADR-0009). No validator: the typed id can't be malformed.
/// </remarks>
/// <param name="UserId">The user id from the session.</param>
public sealed record SyncUserGroupsCommand(UserId UserId) : ICommand;
