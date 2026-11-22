using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Domain.Clusters;

namespace FleetConsole.Application.Credentials.ConnectionTesting;

/// <summary>
/// What a connection test runs against: how to connect, plus the cluster's <b>declared</b> distribution, which the
/// <c>distribution</c> step compares with what API discovery shows (ADR-0032, DIST-7/8). Kept apart from
/// <see cref="ClusterConnection"/> so the probe port carries connection data only, not presentation data.
/// Built by <see cref="ConnectionTester.TargetOf"/>.
/// </summary>
/// <param name="Connection">Where and how to connect.</param>
/// <param name="Distribution">The distribution the admin declared for the cluster.</param>
internal sealed record ConnectionTestTarget(ClusterConnection Connection, ClusterDistribution Distribution);
