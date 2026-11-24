namespace FleetConsole.Application.Abstractions.Kubernetes;

/// <summary>
/// The host cluster's OpenShift <c>Group</c> objects (<c>user.openshift.io/v1</c>) as FleetConsole's own host
/// ServiceAccount sees them (ADR-0039 §1): the one source for the group picker, the Groups pages and the revalidation
/// of a user's recorded groups.
/// </summary>
/// <remarks>
/// <para>Implemented in Infrastructure (<c>OpenShiftHostGroupDirectory</c>, a singleton) over a process-wide snapshot
/// that is refreshed when older than <c>Auth:HostGroups:MaxSnapshotAge</c>, single-flight (ADR-0039 §2).</para>
/// <para><b>Fail-safe off:</b> host problems are values, not exceptions. When a refresh fails the caller gets
/// <see cref="HostGroupsStatus.Forbidden"/> or <see cref="HostGroupsStatus.Unavailable"/> with no groups — never the
/// previous, older snapshot — so a membership removed on the host can't keep granting access through stale data.</para>
/// </remarks>
public interface IHostGroupDirectory
{
    /// <summary>
    /// Returns the current listing. Never throws for host problems (only <see cref="OperationCanceledException"/> when
    /// <paramref name="cancellationToken"/> fires) and never returns data read longer than <c>MaxSnapshotAge</c> ago.
    /// </summary>
    /// <param name="cancellationToken">Cancels the wait for, or the run of, a refresh.</param>
    /// <returns>The listing; <see cref="HostGroupListing.Groups"/> is empty unless the status is <see cref="HostGroupsStatus.Ok"/>.</returns>
    Task<HostGroupListing> GetAsync(CancellationToken cancellationToken);
}
