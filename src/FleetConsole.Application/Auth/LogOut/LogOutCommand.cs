using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Auth.LogOut;

/// <summary>
/// Records that the signed-in user logged out (AUTH-10, <c>auth.logout</c>). The Api dispatches it from
/// <c>POST /api/auth/logout</c> only when a session exists, then clears the cookie itself.
/// </summary>
/// <remarks>
/// Changes no aggregate: the handler stages the audit entry and returns success so <c>UnitOfWorkBehavior</c> saves it.
/// Not <see cref="IMutatingCommand"/>: read-only users must be able to log out.
/// </remarks>
public sealed record LogOutCommand : ICommand, IRequireAuthenticated;
