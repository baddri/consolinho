using FleetConsole.Application.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Application.Tests.Common;

public sealed class ConnectionTestSummaryMappingTests
{
    private static readonly DateTimeOffset TestedAt = new(2026, 11, 19, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void NeverTested_MapsToNull()
    {
        ConnectionTestSummaryMapping.ToDto(null, TestedAt).ShouldBeNull();
    }

    [Fact]
    public void SettingsUnchangedSinceTest_IsFresh_AndCopiesEveryField()
    {
        var summary = new ConnectionTestSummary(TestedAt, Succeeded: false, ConnectionTestStep.Authentication, CapabilityLevel.Limited);

        var dto = ConnectionTestSummaryMapping.ToDto(summary, connectionSettingsChangedAt: TestedAt.AddHours(-1));

        dto.ShouldBe(new ConnectionTestSummaryDto(TestedAt, false, ConnectionTestStep.Authentication, CapabilityLevel.Limited, IsStale: false));
    }

    [Fact]
    public void SettingsChangedAtTheSameInstant_IsFresh()
    {
        var summary = new ConnectionTestSummary(TestedAt, Succeeded: true, FailedStep: null, CapabilityLevel.ClusterWideView);

        ConnectionTestSummaryMapping.ToDto(summary, TestedAt)!.IsStale.ShouldBeFalse();
    }

    [Fact]
    public void SettingsChangedAfterTest_IsStale()
    {
        var summary = new ConnectionTestSummary(TestedAt, Succeeded: true, FailedStep: null, Headline: null);

        var dto = ConnectionTestSummaryMapping.ToDto(summary, connectionSettingsChangedAt: TestedAt.AddSeconds(1));

        dto.ShouldNotBeNull();
        dto.IsStale.ShouldBeTrue();
        dto.Succeeded.ShouldBeTrue();
        dto.FailedStep.ShouldBeNull();
        dto.Headline.ShouldBeNull();
    }
}
