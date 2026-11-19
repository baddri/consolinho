using FleetConsole.Api.Http;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Users.ChangeUserRole;
using FleetConsole.Application.Users.CreateUser;
using FleetConsole.Application.Users.DeactivateUser;
using FleetConsole.Application.Users.GetUser;
using FleetConsole.Application.Users.ListUsers;
using FleetConsole.Application.Users.ReactivateUser;
using FleetConsole.Application.Users.SetUserReadOnly;
using FleetConsole.Domain.Common;
using Microsoft.AspNetCore.Http.HttpResults;

namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// <c>/api/admin/users</c>: user administration (contract §7.2, USR-1..6). Each endpoint combines route values and the
/// request body into one command or query; the grant routes under a user are mapped by the grants feature.
/// </summary>
/// <remarks>
/// <para><b>Commands return keys, endpoints re-query</b> (ADR-0013 §5): every command returns the username and the
/// endpoint then dispatches <see cref="GetUserQuery"/>, so the response carries the <c>version</c> written by the
/// commit, not the one the handler loaded.</para>
/// <para>Authorization (admin role, read-only guard), validation and the version check all happen in the pipeline and
/// handlers; the endpoints only translate HTTP.</para>
/// </remarks>
public static class UsersAdminEndpoints
{
    /// <summary>Maps the user endpoints into the <c>/api/admin</c> group.</summary>
    /// <param name="admin">The <c>/api/admin</c> group.</param>
    /// <returns>The <c>/api/admin/users</c> group.</returns>
    public static RouteGroupBuilder MapUsersAdminEndpoints(this RouteGroupBuilder admin)
    {
        ArgumentNullException.ThrowIfNull(admin);

        var users = admin.MapGroup("/users").WithTags("Users");

        users.MapGet("", ListUsers).WithName("ListUsers");
        users.MapPost("", CreateUser).WithName("CreateUser");
        users.MapGet("/{username}", GetUser).WithName("GetUser");
        users.MapPut("/{username}/role", ChangeUserRole).WithName("ChangeUserRole");
        users.MapPut("/{username}/read-only", SetUserReadOnly).WithName("SetUserReadOnly");
        users.MapPost("/{username}/deactivate", DeactivateUser).WithName("DeactivateUser");
        users.MapPost("/{username}/reactivate", ReactivateUser).WithName("ReactivateUser");

        return users;
    }

    // XML docs on the handlers are published as OpenAPI summaries (written for API consumers); implementation notes are
    // in // comments.

    /// <summary>Lists all users, sorted by username.</summary>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the users.</returns>
    internal static async Task<Results<Ok<IReadOnlyList<UserListItemDto>>, ProblemHttpResult>> ListUsers(
        IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new ListUsersQuery(), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>
    /// Pre-creates a user before their first login. Fails with 409 Users.UsernameTaken when the username exists.
    /// </summary>
    /// <param name="request">The new user.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>201 with the user and its Location.</returns>
    internal static async Task<Results<Created<UserDetailDto>, ProblemHttpResult>> CreateUser(
        CreateUserRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var created = await dispatcher.Send(
            new CreateUserCommand(request.Username, request.Role, request.IsReadOnly), cancellationToken).ConfigureAwait(false);
        if (created.IsFailure)
        {
            return created.ToProblemDetails();
        }

        var detail = await dispatcher.Send(new GetUserQuery(created.Value), cancellationToken).ConfigureAwait(false);
        return detail.ToHttpResult(user => TypedResults.Created(UserLocation(user.Username), user));
    }

    /// <summary>Returns one user. Fails with 404 Users.NotFound for an unknown username.</summary>
    /// <param name="username">The OpenShift username (URL-encoded).</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the user.</returns>
    internal static async Task<Results<Ok<UserDetailDto>, ProblemHttpResult>> GetUser(
        string username, IDispatcher dispatcher, CancellationToken cancellationToken) =>
        (await dispatcher.Send(new GetUserQuery(username), cancellationToken).ConfigureAwait(false)).ToHttpResult();

    /// <summary>
    /// Promotes (admin) or demotes (user) a user. Promoting a user who is admin only via configuration records the
    /// assignment so it survives leaving the admin group. Demote fails with 409 Users.AdminViaConfiguration,
    /// Users.SelfChange or Users.LastAdmin; a stale version with 409 Concurrency.Conflict.
    /// </summary>
    /// <param name="username">The OpenShift username (URL-encoded).</param>
    /// <param name="request">The requested role and the user's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated user.</returns>
    internal static async Task<Results<Ok<UserDetailDto>, ProblemHttpResult>> ChangeUserRole(
        string username, ChangeUserRoleRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await dispatcher.Send(
            new ChangeUserRoleCommand(username, request.Role, request.Version), cancellationToken).ConfigureAwait(false);
        return await ThenGetUserAsync(result, dispatcher, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Sets or clears a user's global read-only flag. Fails with 409 Users.LastAdmin when no active writable
    /// administrator would remain; a stale version with 409 Concurrency.Conflict.
    /// </summary>
    /// <param name="username">The OpenShift username (URL-encoded).</param>
    /// <param name="request">The requested value and the user's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated user.</returns>
    internal static async Task<Results<Ok<UserDetailDto>, ProblemHttpResult>> SetUserReadOnly(
        string username, SetUserReadOnlyRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await dispatcher.Send(
            new SetUserReadOnlyCommand(username, request.IsReadOnly, request.Version), cancellationToken).ConfigureAwait(false);
        return await ThenGetUserAsync(result, dispatcher, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Deactivates a user: login is refused and their sessions end within the revalidation interval. Grants are kept.
    /// Fails with 409 Users.SelfChange or Users.LastAdmin; a stale version with 409 Concurrency.Conflict.
    /// </summary>
    /// <param name="username">The OpenShift username (URL-encoded).</param>
    /// <param name="request">The user's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated user.</returns>
    internal static async Task<Results<Ok<UserDetailDto>, ProblemHttpResult>> DeactivateUser(
        string username, VersionRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await dispatcher.Send(
            new DeactivateUserCommand(username, request.Version), cancellationToken).ConfigureAwait(false);
        return await ThenGetUserAsync(result, dispatcher, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Reactivates a deactivated user; their grants apply again. Sessions from before the deactivation stay ended. A
    /// stale version fails with 409 Concurrency.Conflict.
    /// </summary>
    /// <param name="username">The OpenShift username (URL-encoded).</param>
    /// <param name="request">The user's version.</param>
    /// <param name="dispatcher">The CQRS dispatcher.</param>
    /// <param name="cancellationToken">Request-aborted token.</param>
    /// <returns>200 with the updated user.</returns>
    internal static async Task<Results<Ok<UserDetailDto>, ProblemHttpResult>> ReactivateUser(
        string username, VersionRequest request, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var result = await dispatcher.Send(
            new ReactivateUserCommand(username, request.Version), cancellationToken).ConfigureAwait(false);
        return await ThenGetUserAsync(result, dispatcher, cancellationToken).ConfigureAwait(false);
    }

    // A failed command becomes its ProblemDetails; a successful one is answered with the freshly read user (post-commit
    // version, ADR-0013 §5).
    private static async Task<Results<Ok<UserDetailDto>, ProblemHttpResult>> ThenGetUserAsync(
        Result<string> commandResult, IDispatcher dispatcher, CancellationToken cancellationToken)
    {
        if (commandResult.IsFailure)
        {
            return commandResult.ToProblemDetails();
        }

        return (await dispatcher.Send(new GetUserQuery(commandResult.Value), cancellationToken).ConfigureAwait(false)).ToHttpResult();
    }

    // Usernames may contain ':' or '@' (OpenShift identity provider prefixes); escape them as one path segment.
    private static string UserLocation(string username) => $"/api/admin/users/{Uri.EscapeDataString(username)}";
}
