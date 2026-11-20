using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Users;

/// <summary>
/// The expected failures of the user area, with the stable codes and user-facing messages of the API contract (§2).
/// Returned by <see cref="User"/> behaviour methods, <see cref="Username.Create"/> and the user use-case handlers; the
/// Api maps the <see cref="ErrorType"/> to the HTTP status and shows <see cref="Error.Message"/> verbatim.
/// </summary>
public static class UserErrors
{
    /// <summary>No user with the given username exists (unknown <c>{username}</c> in a route). HTTP 404.</summary>
    /// <param name="username">The username that was looked up.</param>
    /// <returns>A <c>Users.NotFound</c> error.</returns>
    public static Error NotFound(string username) =>
        Error.NotFound("Users.NotFound", $"User {username} was not found.");

    /// <summary>Creating a user whose username already exists (USR-2). HTTP 409.</summary>
    /// <param name="username">The duplicate username.</param>
    /// <returns>A <c>Users.UsernameTaken</c> error.</returns>
    public static Error UsernameTaken(string username) =>
        Error.Conflict("Users.UsernameTaken", $"User {username} already exists.");

    /// <summary>
    /// The change would leave no active, writable administrator (ADM-5): demoting, deactivating or setting read-only
    /// the last one. HTTP 409.
    /// </summary>
    /// <param name="username">The user the change was attempted on.</param>
    /// <returns>A <c>Users.LastAdmin</c> error.</returns>
    public static Error LastAdmin(string username) =>
        Error.Conflict(
            "Users.LastAdmin",
            $"{username} is the last active administrator who can make changes. Promote another user first.");

    /// <summary>An admin tried to demote or deactivate themselves (ADM-5). HTTP 409.</summary>
    /// <returns>A <c>Users.SelfChange</c> error.</returns>
    public static Error SelfChange() =>
        Error.Conflict("Users.SelfChange", "You can't demote or deactivate yourself. Ask another administrator.");

    /// <summary>
    /// Demoting a user who is admin through configuration (USR-6); only changing the configuration removes that role.
    /// HTTP 409.
    /// </summary>
    /// <param name="source">The configuration source as stored on the user, e.g. <c>"group fleetconsole-admins"</c>.</param>
    /// <returns>A <c>Users.AdminViaConfiguration</c> error.</returns>
    public static Error AdminViaConfiguration(string source) =>
        Error.Conflict(
            "Users.AdminViaConfiguration",
            $"Admin granted by configuration ({source}). Change the configuration to remove.");

    /// <summary>
    /// A deactivated user tried to log in (AUTH-7). Used by the login flow only, which turns it into a "login denied"
    /// outcome and audit entry; it never reaches an HTTP response as ProblemDetails.
    /// </summary>
    /// <returns>A <c>Users.Deactivated</c> error.</returns>
    public static Error Deactivated() =>
        Error.Forbidden("Users.Deactivated", "Your Consolinho account is deactivated.");

    /// <summary>
    /// A username breaks the OpenShift user-name rules (USR-2). Produced by <see cref="Username.Create"/>; validators
    /// surface the message as a field error on <c>username</c>. HTTP 400.
    /// </summary>
    /// <param name="message">Which rule was broken, e.g. "Username can't contain '/', '%' or whitespace."</param>
    /// <returns>A <c>Users.InvalidUsername</c> error.</returns>
    public static Error InvalidUsername(string message) =>
        Error.Validation("Users.InvalidUsername", message);
}
