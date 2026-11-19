using FleetConsole.Application.Clusters.GetCluster;
using FleetConsole.Application.Clusters.ListClusters;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Tests.Clusters;

/// <summary>
/// The in-memory roll-ups of the cluster queries: worst credential expiry (contract §3 severity order) and CA
/// certificate expiry (30-day window, same boundaries as <c>TokenMetadata.StatusAt</c>).
/// </summary>
public sealed class ClusterStatusTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 19, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Worst_OfNone_IsNull() => ListClustersHandler.Worst([]).ShouldBeNull();

    [Theory]
    [InlineData(new[] { CredentialExpiryStatus.Ok, CredentialExpiryStatus.NoExpiry }, CredentialExpiryStatus.NoExpiry)]
    [InlineData(new[] { CredentialExpiryStatus.NoExpiry, CredentialExpiryStatus.Unknown }, CredentialExpiryStatus.Unknown)]
    [InlineData(new[] { CredentialExpiryStatus.Unknown, CredentialExpiryStatus.ExpiringSoon, CredentialExpiryStatus.Ok }, CredentialExpiryStatus.ExpiringSoon)]
    [InlineData(new[] { CredentialExpiryStatus.ExpiringSoon, CredentialExpiryStatus.Expired }, CredentialExpiryStatus.Expired)]
    [InlineData(new[] { CredentialExpiryStatus.Ok }, CredentialExpiryStatus.Ok)]
    public void Worst_IsMostSevere(CredentialExpiryStatus[] statuses, CredentialExpiryStatus expected) =>
        ListClustersHandler.Worst(statuses).ShouldBe(expected);

    [Theory]
    [InlineData(-1, CertificateExpiryStatus.Expired)]
    [InlineData(0, CertificateExpiryStatus.Expired)]
    [InlineData(1, CertificateExpiryStatus.ExpiringSoon)]
    [InlineData(30 * 24 * 60, CertificateExpiryStatus.ExpiringSoon)]
    [InlineData((30 * 24 * 60) + 1, CertificateExpiryStatus.Ok)]
    public void CertificateExpiry_UsesThirtyDayWindow(int minutesUntilNotAfter, CertificateExpiryStatus expected) =>
        GetClusterHandler.ExpiryStatus(Now.AddMinutes(minutesUntilNotAfter), Now).ShouldBe(expected);
}
