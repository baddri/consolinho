using FleetConsole.Application.Abstractions.Messaging;

namespace FleetConsole.Application.Users.ListUsers;

/// <summary>
/// Lists every user for the Fleet administration user list (USR-1, <c>GET /api/admin/users</c>), sorted by username. The
/// list is bounded (tens to low hundreds), so it is a plain array the UI filters and sorts itself (ADR-0013 §7).
/// </summary>
/// <remarks>Readable by read-only admins: an <see cref="IAdminRequest"/>, not an <see cref="IMutatingCommand"/>.</remarks>
public sealed record ListUsersQuery : IQuery<IReadOnlyList<UserListItemDto>>, IAdminRequest;
