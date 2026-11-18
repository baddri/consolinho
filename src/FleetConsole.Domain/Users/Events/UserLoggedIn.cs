using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users.Events;

/// <summary>A user completed an OpenShift login and a session is about to be issued. Audited as <c>auth.login</c>.</summary>
/// <param name="UserId">The user's id.</param>
/// <param name="Username">The user's username.</param>
/// <param name="Groups">The OpenShift groups reported at this login.</param>
/// <param name="Provisioned">Whether the user was auto-provisioned by this login.</param>
public sealed record UserLoggedIn(UserId UserId, string Username, IReadOnlyList<string> Groups, bool Provisioned) : IDomainEvent;
