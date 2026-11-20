using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users.CreateUser;

/// <summary>
/// Pre-creates a user before their first login (USR-2, <c>POST /api/admin/users</c>), so an admin can grant cluster
/// access in advance or allow login when auto-provisioning is off. The user stays <see cref="UserStatus.Pending"/> until
/// they log in. Audited as <c>user.created</c>.
/// </summary>
/// <remarks>Returns the username; the endpoint re-reads the user (<c>GetUserQuery</c>) for the 201 body.</remarks>
/// <param name="Username">The OpenShift username, exactly as OpenShift reports it (USR-2 rules).</param>
/// <param name="Role">The initial role; <see cref="UserRole.Admin"/> records an admin assignment.</param>
/// <param name="IsReadOnly">The initial global read-only flag.</param>
public sealed record CreateUserCommand(string Username, UserRole Role, bool IsReadOnly)
    : ICommand<string>, IAdminRequest, IMutatingCommand;
