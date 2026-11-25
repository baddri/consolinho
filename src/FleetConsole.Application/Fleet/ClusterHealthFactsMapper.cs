using FleetConsole.Application.Abstractions.Kubernetes;

namespace FleetConsole.Application.Fleet;

/// <summary>
/// Turns an <see cref="IClusterHealthReader"/> reading into cacheable <see cref="ClusterHealthFacts"/> (ADR-0041 §4,
/// contract §2): a mechanical reduction, no health judgement — the frontend derives the status.
/// </summary>
/// <remarks>
/// <para><b>Cluster-level failure.</b> Any probe failing with a connection, TLS, timeout, 401 or bad-answer kind means
/// the cluster could not be read; the most severe kind across the probes wins (<see cref="Severity"/>) and every
/// section is null, so a half-read cluster never shows partial counts.</para>
/// <para><b>Sections.</b> Otherwise each probe becomes its section: ok → facts, 403 → <c>forbidden</c>, 404 →
/// <c>notFound</c> (counts null). A probe the distribution doesn't use stays null.</para>
/// </remarks>
internal static class ClusterHealthFactsMapper
{
    /// <summary>Maps <paramref name="reading"/> to facts stamped <paramref name="now"/>.</summary>
    /// <param name="reading">The reader's results.</param>
    /// <param name="now">When the probe ran (<c>checkedAt</c>).</param>
    /// <returns>The facts.</returns>
    public static ClusterHealthFacts Map(ClusterHealthReading reading, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(reading);

        var failure = ClusterFailure(
            reading.KubernetesVersion?.Failure,
            reading.ClusterVersion?.Failure,
            reading.ClusterOperators?.Failure,
            reading.Nodes.Failure);
        if (failure is { } clusterFailure)
        {
            return ClusterHealthFacts.Failed(now, clusterFailure);
        }

        return new ClusterHealthFacts(
            now,
            null,
            reading.KubernetesVersion is { } version ? MapKubernetesVersion(version) : null,
            reading.ClusterVersion is { } clusterVersion ? MapClusterVersion(clusterVersion) : null,
            reading.ClusterOperators is { } operators ? MapClusterOperators(operators) : null,
            MapNodes(reading.Nodes));
    }

    /// <summary>The most severe cluster-level failure among the probes' failures, or null when there is none.</summary>
    private static FleetClusterFailure? ClusterFailure(params ProbeFailure?[] failures)
    {
        FleetClusterFailure? worst = null;
        foreach (var failure in failures)
        {
            if (failure is null || ToClusterFailure(failure.Kind) is not { } candidate)
            {
                continue;
            }

            if (worst is null || Severity(candidate) < Severity(worst.Value))
            {
                worst = candidate;
            }
        }

        return worst;
    }

    /// <summary>The cluster-level failure a probe failure kind means; null for section-level kinds (403, 404).</summary>
    private static FleetClusterFailure? ToClusterFailure(ProbeFailureKind kind) => kind switch
    {
        ProbeFailureKind.DnsFailure or ProbeFailureKind.ConnectionRefused => FleetClusterFailure.Unreachable,
        ProbeFailureKind.TlsUnknownAuthority or ProbeFailureKind.TlsHostnameMismatch
            or ProbeFailureKind.TlsCertificateExpired or ProbeFailureKind.TlsOther => FleetClusterFailure.TlsError,
        ProbeFailureKind.Timeout => FleetClusterFailure.Timeout,
        ProbeFailureKind.Unauthorized => FleetClusterFailure.TokenInvalid,
        ProbeFailureKind.UnexpectedStatus or ProbeFailureKind.InvalidResponse => FleetClusterFailure.UpstreamError,
        ProbeFailureKind.Forbidden or ProbeFailureKind.NotFound => null,
        // A kind added later is treated as a bad answer until it is mapped deliberately.
        _ => FleetClusterFailure.UpstreamError,
    };

    /// <summary>
    /// Precedence when probes fail differently (lower = more severe): a cluster that can't be reached at all says more
    /// than a TLS problem, which says more than slowness, a rejected token or one odd answer.
    /// </summary>
    private static int Severity(FleetClusterFailure failure) => failure switch
    {
        FleetClusterFailure.Unreachable => 0,
        FleetClusterFailure.TlsError => 1,
        FleetClusterFailure.Timeout => 2,
        FleetClusterFailure.TokenInvalid => 3,
        _ => 4,
    };

    /// <summary>The section outcome of a probe that did not fail at cluster level.</summary>
    private static FleetProbeOutcome Outcome<T>(ProbeResponse<T> response) => response.Failure?.Kind switch
    {
        null => FleetProbeOutcome.Ok,
        ProbeFailureKind.Forbidden => FleetProbeOutcome.Forbidden,
        ProbeFailureKind.NotFound => FleetProbeOutcome.NotFound,
        var kind => throw new InvalidOperationException($"Probe failure kind {kind} is a cluster-level failure."),
    };

    private static FleetKubernetesVersionDto MapKubernetesVersion(ProbeResponse<KubernetesVersionFacts> response) =>
        response.IsSuccess
            ? new(FleetProbeOutcome.Ok, response.Value.GitVersion)
            : new(Outcome(response), null);

    private static FleetClusterVersionDto MapClusterVersion(ProbeResponse<ClusterVersionFacts> response)
    {
        if (!response.IsSuccess)
        {
            return new(Outcome(response), null, null, null, null, null, null);
        }

        var facts = response.Value;
        return new(FleetProbeOutcome.Ok, facts.CurrentVersion, facts.DesiredVersion, facts.Available, facts.Progressing,
            facts.Failing, facts.AvailableUpdates);
    }

    private static FleetClusterOperatorsDto MapClusterOperators(ProbeResponse<ClusterOperatorCounts> response)
    {
        if (!response.IsSuccess)
        {
            return new(Outcome(response), null, null, null, null);
        }

        var counts = response.Value;
        return new(FleetProbeOutcome.Ok, counts.Total, counts.Degraded, counts.Unavailable, counts.Progressing);
    }

    private static FleetNodesDto MapNodes(ProbeResponse<NodeCounts> response)
    {
        if (!response.IsSuccess)
        {
            return new(Outcome(response), null, null, null, null);
        }

        var counts = response.Value;
        return new(FleetProbeOutcome.Ok, counts.Total, counts.Ready, counts.Total - counts.Ready, counts.Unschedulable);
    }
}
