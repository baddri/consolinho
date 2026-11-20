namespace FleetConsole.Domain.Access;

/// <summary>
/// The display names a <see cref="Grant"/> needs for its audit events but does not own, because it references user,
/// cluster and credential by id only. The handler reads them together with the grant.
/// </summary>
/// <param name="Username">The granted user's username.</param>
/// <param name="ClusterName">The cluster's name.</param>
/// <param name="CredentialName">The name of the credential the grant currently uses.</param>
public sealed record GrantLabels(string Username, string ClusterName, string CredentialName);
