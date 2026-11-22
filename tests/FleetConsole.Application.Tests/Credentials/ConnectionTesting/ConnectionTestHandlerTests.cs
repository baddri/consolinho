using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Credentials;
using FleetConsole.Application.Credentials.ConnectionTesting;
using FleetConsole.Application.Credentials.TestCredential;
using FleetConsole.Application.Credentials.TestToken;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Auth;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Credentials.Events;
using Microsoft.Extensions.Options;
using NSubstitute;
using static FleetConsole.Application.Tests.Credentials.TestTokens;

namespace FleetConsole.Application.Tests.Credentials.ConnectionTesting;

/// <summary>
/// The two test handlers over substituted repositories and the scripted probe: what they load, record and audit. The
/// step logic itself is covered by <see cref="ConnectionTesterTests"/>.
/// </summary>
public sealed class ConnectionTestHandlerTests
{
    private const string StoredToken = "sha256~fake-stored-token";
    private const string UnsavedToken = "sha256~fake-unsaved-token";

    private readonly IClusterRepository _clusters = Substitute.For<IClusterRepository>();
    private readonly ICredentialRepository _credentials = Substitute.For<ICredentialRepository>();
    private readonly IGrantRepository _grants = Substitute.For<IGrantRepository>();
    private readonly ITokenProtector _protector = Substitute.For<ITokenProtector>();
    private readonly FakeProbeClient _probes = new();
    private readonly RecordingAuditTrail _audit = new();
    private readonly Cluster _cluster = NewCluster("prod-eu-1");

    public ConnectionTestHandlerTests()
    {
        _clusters.GetByNameAsync(_cluster.Name, Arg.Any<CancellationToken>()).Returns(_cluster);
        _protector.Unprotect(Arg.Any<EncryptedToken>()).Returns(Sensitive(StoredToken));
        _grants.CountByModeAsync(Arg.Any<CredentialId>(), Arg.Any<CancellationToken>()).Returns(new GrantModeCounts(0, 0));
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task TestCredential_tests_the_decrypted_token_and_records_the_summary()
    {
        var credential = Existing(_cluster);

        var result = await CredentialHandler().Handle(new TestCredentialCommand("prod-eu-1", credential.Id.Value, null), Ct);

        result.IsSuccess.ShouldBeTrue();
        _probes.OpenedToken.ShouldNotBeNull().Reveal().ShouldBe(StoredToken);
        _probes.OpenedConnection.ShouldBe(new ClusterConnection(_cluster.Endpoint.Url, null, false));
        credential.LastTest.ShouldBe(new ConnectionTestSummary(FixedClock.Now, true, null, CapabilityLevel.Limited));
        credential.DomainEvents.OfType<CredentialTested>().ShouldHaveSingleItem().ClusterName.ShouldBe("prod-eu-1");
    }

    [Fact]
    public async Task TestCredential_hints_use_the_grant_counts_of_the_credential()
    {
        var credential = Existing(_cluster);
        _grants.CountByModeAsync(credential.Id, Arg.Any<CancellationToken>()).Returns(new GrantModeCounts(ReadOnly: 0, ReadWrite: 2));

        var result = await CredentialHandler().Handle(new TestCredentialCommand("prod-eu-1", credential.Id.Value, null), Ct);

        result.IsSuccess.ShouldBeTrue();
        result.Value.Hints.ShouldBe([new ConnectionTestHintDto(
            HintSeverity.Warning, "2 users have ReadWrite grants with this credential but it cannot modify workloads")]);
        await _grants.Received(1).CountByModeAsync(credential.Id, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TestToken_with_credential_reads_its_grant_counts()
    {
        var credential = Existing(_cluster);

        var result = await TokenHandler().Handle(
            new TestTokenCommand("prod-eu-1", Sensitive(UnsavedToken), credential.Id.Value, null), Ct);

        result.IsSuccess.ShouldBeTrue();
        await _grants.Received(1).CountByModeAsync(credential.Id, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task TestCredential_failed_test_is_a_successful_result_with_failed_summary()
    {
        var credential = Existing(_cluster);
        _probes.SelfSubjectReview = _ => FakeProbeClient.Fail<SelfSubjectReviewInfo>(ProbeFailureKind.Unauthorized);

        var result = await CredentialHandler().Handle(new TestCredentialCommand("prod-eu-1", credential.Id.Value, null), Ct);

        result.IsSuccess.ShouldBeTrue();
        result.Value.Succeeded.ShouldBeFalse();
        credential.LastTest.ShouldBe(new ConnectionTestSummary(FixedClock.Now, false, ConnectionTestStep.Authentication, null));
    }

    [Fact]
    public async Task TestCredential_of_another_cluster_is_NotFound()
    {
        var credential = Existing(NewCluster("other-cluster"));

        var result = await CredentialHandler().Handle(new TestCredentialCommand("prod-eu-1", credential.Id.Value, null), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Credentials.NotFound");
        _probes.OpenedToken.ShouldBeNull();
    }

    [Fact]
    public async Task TestToken_audits_the_fingerprint_and_changes_nothing()
    {
        var result = await TokenHandler().Handle(new TestTokenCommand("prod-eu-1", Sensitive(UnsavedToken), null, null), Ct);

        result.IsSuccess.ShouldBeTrue();
        result.Value.Hints.ShouldBeEmpty();
        await _grants.DidNotReceive().CountByModeAsync(Arg.Any<CredentialId>(), Arg.Any<CancellationToken>());
        _probes.OpenedToken.ShouldNotBeNull().Reveal().ShouldBe(UnsavedToken);
        var record = _audit.Single;
        record.Action.ShouldBe("credential.token_tested");
        record.TargetType.ShouldBe(AuditTargetType.Cluster);
        record.ClusterName.ShouldBe("prod-eu-1");
        var details = FleetConsole.Application.Audit.AuditTrail.SerializeDetails(record.Details);
        details.ShouldContain($"\"fingerprint\":\"{TokenFingerprints.Compute(Sensitive(UnsavedToken)).Value}\"");
        details.ShouldContain("\"headline\":\"limited\"");
        details.ShouldNotContain(UnsavedToken);
        record.Summary.ShouldNotContain(UnsavedToken);
        _credentials.DidNotReceive().Add(Arg.Any<Credential>());
    }

    [Fact]
    public async Task TestToken_with_credential_of_another_cluster_is_a_field_error()
    {
        var foreign = Existing(NewCluster("other-cluster"));

        var result = await TokenHandler().Handle(
            new TestTokenCommand("prod-eu-1", Sensitive(UnsavedToken), foreign.Id.Value, null), Ct);

        result.Error.ShouldBeOfType<ValidationError>().Errors.Keys.ShouldBe([nameof(TestTokenCommand.CredentialId)]);
        _audit.Records.ShouldBeEmpty();
        _probes.OpenedToken.ShouldBeNull();
    }

    [Fact]
    public async Task TestToken_on_unknown_cluster_is_NotFound()
    {
        var result = await TokenHandler().Handle(new TestTokenCommand("nope", Sensitive(UnsavedToken), null, null), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Clusters.NotFound");
    }

    private ConnectionTester Tester() => new(_probes, new FixedClock(), Options.Create(new CredentialsOptions()));

    private TestCredentialHandler CredentialHandler() => new(_clusters, _credentials, _grants, _protector, Tester());

    private TestTokenHandler TokenHandler() => new(_clusters, _credentials, _grants, Tester(), _audit);

    private static Cluster NewCluster(string name)
    {
        var endpoint = ApiServerEndpoint.Create($"https://api.{name}.example.com:6443", null, false).Value;
        var cluster = Cluster.Register(
            ClusterName.Create(name).Value, null, endpoint, ClusterEnvironment.Production, ClusterDistribution.OpenShift, null, null, true, "admin", FixedClock.Now);
        cluster.ClearDomainEvents();
        return cluster;
    }

    private Credential Existing(Cluster cluster)
    {
        var credential = Credential.Add(
            cluster,
            CredentialName.Create("fleet-view").Value,
            null,
            new EncryptedToken([9]),
            TokenFingerprints.Compute(Sensitive(StoredToken)),
            TokenMetadata.Opaque,
            "admin",
            FixedClock.Now);
        credential.ClearDomainEvents();
        _credentials.GetByIdAsync(credential.Id, Arg.Any<CancellationToken>()).Returns(credential);
        return credential;
    }
}
