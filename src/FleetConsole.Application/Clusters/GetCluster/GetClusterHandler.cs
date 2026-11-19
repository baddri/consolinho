using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Clusters.GetCluster;

/// <summary>
/// Answers <see cref="GetClusterQuery"/> with one read-model query: the cluster's columns plus correlated counts of its
/// credentials and grants. CA certificate summaries and the TLS mode are derived in memory from the materialized
/// <see cref="ApiServerEndpoint"/> (they are not columns).
/// </summary>
/// <param name="readModel">No-tracking queryables.</param>
/// <param name="clock">"Now" for the certificate expiry status.</param>
internal sealed class GetClusterHandler(IReadModel readModel, IClock clock)
    : IRequestHandler<GetClusterQuery, Result<ClusterDetailDto>>
{
    /// <summary>Certificates expiring within this window are flagged (CLU-2).</summary>
    internal static readonly TimeSpan CertificateWarningWindow = TimeSpan.FromDays(30);

    /// <inheritdoc />
    public async Task<Result<ClusterDetailDto>> Handle(GetClusterQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // A name that can't be a cluster name can't exist either: 404, like any unknown route id.
        var name = ClusterName.Create(request.Name);
        if (name.IsFailure)
        {
            return ClusterErrors.NotFound(request.Name);
        }

        // Locals so EF Core inlines the queryables as correlated subqueries (one SQL statement).
        var clusterName = name.Value;
        var credentials = readModel.Credentials;
        var grants = readModel.Grants;
        var query = readModel.Clusters
            .Where(c => c.Name == clusterName)
            .Select(c => new
            {
                c.Name,
                c.DisplayName,
                c.Environment,
                c.Endpoint,
                c.WebConsoleUrl,
                c.Description,
                c.IsEnabled,
                c.ConnectionSettingsChangedAt,
                c.CreatedAt,
                c.CreatedBy,
                c.UpdatedAt,
                c.UpdatedBy,
                c.Version,
                CredentialCount = credentials.Count(cr => cr.ClusterId == c.Id),
                GrantCount = grants.Count(g => g.ClusterId == c.Id),
            });

        var row = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        if (row is null)
        {
            return ClusterErrors.NotFound(clusterName.Value);
        }

        var now = clock.UtcNow;
        var certificates = row.Endpoint.CaBundle?.Certificates
            .Select(certificate => new CaCertificateDto(
                certificate.Subject,
                certificate.Issuer,
                certificate.NotBefore,
                certificate.NotAfter,
                ExpiryStatus(certificate.NotAfter, now),
                certificate.Sha256Fingerprint))
            .ToList() ?? [];

        return new ClusterDetailDto(
            row.Name.Value,
            row.DisplayName,
            row.Environment,
            row.Endpoint.ToString(),
            row.WebConsoleUrl?.OriginalString,
            row.Description,
            row.Endpoint.CaBundle?.Pem,
            certificates.AsReadOnly(),
            row.Endpoint.SkipTlsVerify,
            row.Endpoint.TlsMode,
            row.IsEnabled,
            row.CredentialCount,
            row.GrantCount,
            row.ConnectionSettingsChangedAt,
            row.CreatedAt,
            row.CreatedBy,
            row.UpdatedAt,
            row.UpdatedBy,
            row.Version);
    }

    /// <summary>
    /// Expiry status of a CA certificate (CLU-2). Same boundaries as a token's expiry status
    /// (<c>TokenMetadata.StatusAt</c>): expired at or after <c>notAfter</c>, expiring soon when at most
    /// <see cref="CertificateWarningWindow"/> remains.
    /// </summary>
    /// <param name="notAfter">End of validity.</param>
    /// <param name="now">Current time.</param>
    /// <returns>The status.</returns>
    internal static CertificateExpiryStatus ExpiryStatus(DateTimeOffset notAfter, DateTimeOffset now)
    {
        if (notAfter <= now)
        {
            return CertificateExpiryStatus.Expired;
        }

        return notAfter - now <= CertificateWarningWindow ? CertificateExpiryStatus.ExpiringSoon : CertificateExpiryStatus.Ok;
    }
}
