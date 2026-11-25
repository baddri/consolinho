namespace FleetConsole.Application.Access.LoadAccessSnapshot;

/// <summary>
/// The cached input of access resolution for one user (<see cref="LoadAccessSnapshotQuery"/>): raw rows, not the
/// resolved result, so the enabled filter, the session read-only flag and precedence are applied per request by
/// <see cref="ClusterAccessReader"/>.
/// </summary>
/// <remarks>
/// <para>Primitives only, so it survives a System.Text.Json round-trip through the distributed (Redis) cache; the
/// reader maps them back to value objects. Changing the shape requires bumping the version in
/// <see cref="LoadAccessSnapshotQuery.CacheKey"/>.</para>
/// <para>No plaintext secret: the token is the Data Protection ciphertext as stored in the database; only the proxy
/// decrypts it, per request and only for the winner.</para>
/// </remarks>
/// <param name="UserFound">False when the user does not exist or is deactivated; then everything else is empty.</param>
/// <param name="Username">The user's username.</param>
/// <param name="UserIsReadOnly">The stored read-only flag.</param>
/// <param name="UserGroups">The user's groups as recorded at login or revalidation (PREC-1).</param>
/// <param name="Rows">One row per candidate grant (direct or via a group), disabled clusters included.</param>
internal sealed record AccessSnapshot(
    bool UserFound,
    string Username,
    bool UserIsReadOnly,
    IReadOnlyList<string> UserGroups,
    IReadOnlyList<AccessSnapshotRow> Rows)
{
    /// <summary>The snapshot of an unknown or deactivated user: no access anywhere.</summary>
    public static AccessSnapshot NotFound { get; } = new(false, string.Empty, false, [], []);
}

/// <summary>One candidate grant with the columns of its cluster and credential.</summary>
/// <remarks>Rows of disabled clusters are kept (filtered on read) so the snapshot carries their <c>cluster:</c> tag and
/// re-enabling the cluster invalidates it (ADR-0040 §4).</remarks>
/// <param name="ClusterId">The cluster's id.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="ClusterDisplayName">The cluster's display name.</param>
/// <param name="ClusterIsEnabled">Whether the cluster is enabled.</param>
/// <param name="Environment">The <c>ClusterEnvironment</c> member name.</param>
/// <param name="Distribution">The <c>ClusterDistribution</c> member name.</param>
/// <param name="ApiUrl">The API server URL as stored.</param>
/// <param name="CaBundlePem">The CA bundle PEM, if any.</param>
/// <param name="SkipTlsVerify">Whether TLS verification is skipped.</param>
/// <param name="WebConsoleUrl">The web console URL as entered, if any.</param>
/// <param name="GrantId">The grant's id.</param>
/// <param name="GroupName">The group of a group grant; null for a direct grant.</param>
/// <param name="Priority">The group grant's priority, if any.</param>
/// <param name="AccessMode">The <c>AccessMode</c> member name.</param>
/// <param name="CredentialId">The grant's credential id.</param>
/// <param name="CredentialName">The credential's name.</param>
/// <param name="EncryptedToken">The credential's token ciphertext (Data Protection), never the plaintext.</param>
/// <param name="InspectNamespaces">The credential's saved inspect namespaces, in saved order (names only); exposed as the
/// namespace-selector fallback of the winning grant (CP5.5 NSA-1).</param>
internal sealed record AccessSnapshotRow(
    Guid ClusterId,
    string ClusterName,
    string ClusterDisplayName,
    bool ClusterIsEnabled,
    string Environment,
    string Distribution,
    string ApiUrl,
    string? CaBundlePem,
    bool SkipTlsVerify,
    string? WebConsoleUrl,
    Guid GrantId,
    string? GroupName,
    int? Priority,
    string AccessMode,
    Guid CredentialId,
    string CredentialName,
    byte[] EncryptedToken,
    IReadOnlyList<string> InspectNamespaces);
