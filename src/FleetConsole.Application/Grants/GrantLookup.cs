using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Grants;

/// <summary>
/// Shared pieces of the grant command handlers: the acting admin, the resource-specific concurrency error, the field
/// messages for unknown or mismatching body references (contract §9.3/§9.4) and the display names a grant's audit
/// events need.
/// </summary>
/// <remarks>
/// Body references (username, cluster name, credential id in the request body) are <b>400 field errors</b>, not 404s
/// (ADR-0013 §8), so the handlers build <see cref="ValidationError"/>s with C# property paths as keys; the Api
/// camelCases them.
/// </remarks>
internal static class GrantLookup
{
    /// <summary>The message for a credential id that matches no credential.</summary>
    public const string CredentialDoesNotExistMessage = "Credential doesn't exist.";

    /// <summary>
    /// The 409 for a stale <c>version</c> on a grant (ADR-0013 §4). Same code as the generic commit-time conflict, with
    /// the resource noun in the message (contract §2).
    /// </summary>
    public static Error ConcurrencyConflict { get; } =
        Error.Conflict("Concurrency.Conflict", "This grant was changed by someone else. Reload and try again.");

    /// <summary>The message for a credential of another cluster than the grant's (GRANT-1).</summary>
    public static string CredentialNotInClusterMessage => GrantErrors.CredentialNotInCluster().Message;

    /// <summary>The message for a username in the body that matches no user.</summary>
    /// <param name="username">The username as sent.</param>
    /// <returns>For example "User bob doesn't exist."</returns>
    public static string UserDoesNotExist(string username) => $"User {username} doesn't exist.";

    /// <summary>The message for a cluster name in the body that matches no cluster.</summary>
    /// <param name="clusterName">The cluster name as sent.</param>
    /// <returns>For example "Cluster x doesn't exist."</returns>
    public static string ClusterDoesNotExist(string clusterName) => $"Cluster {clusterName} doesn't exist.";

    /// <summary>
    /// The acting admin's username, recorded as <c>GrantedBy</c>/<c>UpdatedBy</c>. Admin commands only run for
    /// signed-in users (<c>AuthorizationBehavior</c>), so a missing name is a wiring bug, not an expected failure.
    /// </summary>
    /// <param name="currentUser">The current user.</param>
    /// <returns>The username.</returns>
    /// <exception cref="InvalidOperationException">When there is no signed-in user.</exception>
    public static string Actor(ICurrentUser currentUser) =>
        currentUser.Username ?? throw new InvalidOperationException("Grant commands require a signed-in user.");

    /// <summary>Builds a 400 <c>Validation.Failed</c> error from collected field messages.</summary>
    /// <param name="errors">Messages keyed by C# property path (e.g. <c>Items[3].ClusterName</c>); not empty.</param>
    /// <returns>The error.</returns>
    public static ValidationError FieldErrors(Dictionary<string, List<string>> errors) =>
        Error.Validation(errors.ToDictionary(e => e.Key, e => e.Value.ToArray(), StringComparer.Ordinal));

    /// <summary>
    /// Maps the <em>input</em> errors of <see cref="Grant.CreateForGroup"/> / <see cref="Grant.ChangeGroupGrant"/> to
    /// field errors (<c>CredentialId</c>, <c>Priority</c>); the conflicts (<c>Grants.AlreadyExists</c>,
    /// <c>Grants.PriorityTaken</c>) stay 409s, so they return <see langword="null"/>.
    /// </summary>
    /// <param name="error">The domain error.</param>
    /// <returns>The field error, or <see langword="null"/> when <paramref name="error"/> is not an input error.</returns>
    public static ValidationError? GroupGrantFieldError(Error error)
    {
        ArgumentNullException.ThrowIfNull(error);

        string? field =
            error.Code == GrantErrors.CredentialNotInCluster().Code ? "CredentialId"
            : error.Code == GrantErrors.PriorityOutOfRange().Code ? "Priority"
            : null;
        return field is null ? null : FieldErrors(new() { [field] = [error.Message] });
    }

    /// <summary>Adds <paramref name="message"/> to the messages of <paramref name="field"/>.</summary>
    /// <param name="errors">The collected field errors.</param>
    /// <param name="field">The C# property path.</param>
    /// <param name="message">The message.</param>
    public static void AddMessage(this Dictionary<string, List<string>> errors, string field, string message)
    {
        if (!errors.TryGetValue(field, out var messages))
        {
            errors[field] = messages = [];
        }

        messages.Add(message);
    }

    /// <summary>
    /// Reads the display names of a stored grant for its audit events (<see cref="GrantLabels"/>): the subject's name (username or group),
    /// the cluster's name and the name of the credential the grant uses now. Foreign keys guarantee all three exist, so a
    /// missing one means the database is inconsistent, which is a bug.
    /// </summary>
    /// <param name="grant">The tracked grant.</param>
    /// <param name="users">User repository.</param>
    /// <param name="clusters">Cluster repository.</param>
    /// <param name="credentials">Credential repository.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The labels.</returns>
    /// <exception cref="InvalidOperationException">When a referenced row is missing.</exception>
    public static async Task<GrantLabels> LabelsAsync(
        Grant grant,
        IUserRepository users,
        IClusterRepository clusters,
        ICredentialRepository credentials,
        CancellationToken cancellationToken)
    {
        // Group grants name their subject themselves; only user grants need the user's username.
        string subjectName;
        if (grant.UserId is { } userId)
        {
            var user = await users.GetByIdAsync(userId, cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidOperationException($"User {userId} of grant {grant.Id} is missing.");
            subjectName = user.Username.Value;
        }
        else
        {
            subjectName = grant.GroupName?.Value
                ?? throw new InvalidOperationException($"Grant {grant.Id} has neither a user nor a group.");
        }

        var cluster = await clusters.GetByIdAsync(grant.ClusterId, cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidOperationException($"Cluster {grant.ClusterId} of grant {grant.Id} is missing.");
        var credential = await credentials.GetByIdAsync(grant.CredentialId, cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidOperationException($"Credential {grant.CredentialId} of grant {grant.Id} is missing.");
        return new GrantLabels(subjectName, cluster.Name.Value, credential.Name.Value);
    }
}
