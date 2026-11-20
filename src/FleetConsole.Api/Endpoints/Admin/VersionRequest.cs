namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// Body of a state transition that has no other input (deactivate, reactivate, enable, disable, …): the
/// <c>version</c> of the representation the client last saw. A stale version is answered with 409
/// <c>Concurrency.Conflict</c>.
/// </summary>
/// <param name="Version">The resource's <c>version</c> from its last representation.</param>
public sealed record VersionRequest(uint Version);
