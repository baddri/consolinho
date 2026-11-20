using FleetConsole.Domain.Users;

namespace FleetConsole.Api.Auth;

/// <summary>
/// The facts a session carries about its user, in typed form: what <see cref="SessionPrincipalFactory"/> turns into
/// claims at sign-in/revalidation and parses back for every request.
/// </summary>
/// <param name="UserId">The FleetConsole user id.</param>
/// <param name="Username">The login name (OpenShift username).</param>
/// <param name="Role">The effective role at the last sign-in or revalidation.</param>
/// <param name="IsReadOnly">Whether the user is globally read-only (ADM-2).</param>
/// <param name="SecurityStamp">The user's security stamp when the session was issued (ADR-0009).</param>
public sealed record SessionUser(UserId UserId, string Username, UserRole Role, bool IsReadOnly, Guid SecurityStamp);
