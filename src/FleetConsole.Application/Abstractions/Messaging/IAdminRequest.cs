using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Marks an Administration use case: only users whose role is <see cref="UserRole.Admin"/> may run it (ADM-1).
/// Every admin command and query implements it; admin commands additionally implement <see cref="IMutatingCommand"/>
/// so globally read-only admins can still read but not change anything (ADM-2).
/// </summary>
/// <remarks>
/// This is the pipeline's half of the "endpoint policy <b>and</b> behavior" rule (SECURITY.md): the <c>/api/admin</c>
/// group also requires the <c>Admin</c> policy, but the use case stays safe however it is invoked.
/// <code>public sealed record DeactivateUserCommand(string Username, uint Version) : ICommand, IAdminRequest, IMutatingCommand;</code>
/// </remarks>
public interface IAdminRequest : IRequireRole
{
    /// <summary>Always <see cref="UserRole.Admin"/>; supplied here so admin use cases can't get it wrong.</summary>
    UserRole IRequireRole.RequiredRole => UserRole.Admin;
}
