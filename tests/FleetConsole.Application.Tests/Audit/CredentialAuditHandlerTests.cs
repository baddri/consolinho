using FleetConsole.Application.Audit;
using FleetConsole.Application.Audit.EventHandlers;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Credentials.Events;

namespace FleetConsole.Application.Tests.Audit;

public sealed class CredentialAuditHandlerTests
{
    private static readonly CredentialId Id = CredentialId.New();
    private static readonly ClusterId Cluster = ClusterId.New();

    private readonly RecordingAuditTrail _trail = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private CredentialAuditHandler Handler => new(_trail);

    [Fact]
    public async Task CredentialAdded_RecordsFingerprintTokenTypeAndServiceAccount()
    {
        await Handler.Handle(new CredentialAdded(Id, Cluster, "prod-eu-1", "fleet-view", "3fa9c2e1", TokenType.Jwt, "fleet/viewer"), Ct);

        var record = ShouldBeCredentialEntry("credential.added");
        record.Summary.ShouldBe("Added credential fleet-view to cluster prod-eu-1");
        var details = AuditDetails.Of(record).ShouldHaveExactly("fingerprint", "tokenType", "serviceAccount");
        details.Str("fingerprint").ShouldBe("3fa9c2e1");
        details.Str("tokenType").ShouldBe("jwt");
        details.Str("serviceAccount").ShouldBe("fleet/viewer");
    }

    [Fact]
    public async Task CredentialAdded_OpaqueToken_HasNullServiceAccount()
    {
        await Handler.Handle(new CredentialAdded(Id, Cluster, "prod-eu-1", "fleet-view", "3fa9c2e1", TokenType.Opaque, null), Ct);

        var details = AuditDetails.Of(ShouldBeCredentialEntry("credential.added"));
        details.Str("tokenType").ShouldBe("opaque");
        details.IsNull("serviceAccount").ShouldBeTrue();
    }

    [Fact]
    public async Task CredentialRotated_RecordsBothFingerprints()
    {
        await Handler.Handle(new CredentialRotated(Id, Cluster, "prod-eu-1", "fleet-view", "3fa9c2e1", "77aa00ff"), Ct);

        var details = AuditDetails.Of(ShouldBeCredentialEntry("credential.rotated")).ShouldHaveExactly("oldFingerprint", "newFingerprint");
        details.Str("oldFingerprint").ShouldBe("3fa9c2e1");
        details.Str("newFingerprint").ShouldBe("77aa00ff");
    }

    [Fact]
    public async Task CredentialDeleted_RecordsTheFingerprint()
    {
        await Handler.Handle(new CredentialDeleted(Id, Cluster, "prod-eu-1", "fleet-view", "3fa9c2e1"), Ct);

        AuditDetails.Of(ShouldBeCredentialEntry("credential.deleted")).ShouldHaveExactly("fingerprint")
            .Str("fingerprint").ShouldBe("3fa9c2e1");
    }

    [Fact]
    public async Task CredentialTested_Success_RecordsOutcomeAndHeadline()
    {
        await Handler.Handle(new CredentialTested(Id, Cluster, "prod-eu-1", "fleet-view", true, null, CapabilityLevel.ClusterWideView), Ct);

        var record = ShouldBeCredentialEntry("credential.tested");
        record.Summary.ShouldBe("Tested credential fleet-view on cluster prod-eu-1: succeeded");
        var details = AuditDetails.Of(record).ShouldHaveExactly("succeeded", "failedStep", "headline");
        details.GetProperty("succeeded").GetBoolean().ShouldBeTrue();
        details.IsNull("failedStep").ShouldBeTrue();
        details.Str("headline").ShouldBe("clusterWideView");
    }

    [Fact]
    public async Task CredentialTested_Failure_RecordsTheFailedStep()
    {
        await Handler.Handle(new CredentialTested(Id, Cluster, "prod-eu-1", "fleet-view", false, ConnectionTestStep.Authentication, null), Ct);

        var record = ShouldBeCredentialEntry("credential.tested");
        record.Summary.ShouldContain("failed");
        var details = AuditDetails.Of(record);
        details.GetProperty("succeeded").GetBoolean().ShouldBeFalse();
        details.Str("failedStep").ShouldBe("authentication");
        details.IsNull("headline").ShouldBeTrue();
    }

    /// <summary>Shared by every <c>credential.*</c> entry: credential target, its cluster, current-user actor, no related user.</summary>
    private AuditRecord ShouldBeCredentialEntry(string action)
    {
        var record = _trail.Single;
        record.Action.ShouldBe(action);
        record.TargetType.ShouldBe(AuditTargetType.Credential);
        record.TargetId.ShouldBe(Id.Value.ToString());
        record.TargetName.ShouldBe("fleet-view");
        record.ClusterName.ShouldBe("prod-eu-1");
        record.Actor.ShouldBeNull("credential actions are attributed to the current user");
        record.RelatedUsername.ShouldBeNull();
        return record;
    }
}
