using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Credentials.AddCredential;
using FleetConsole.Application.Credentials.DeleteCredential;
using FleetConsole.Application.Credentials.RotateCredentialToken;
using FleetConsole.Application.Credentials.Tokens;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Credentials.Events;
using FleetConsole.Domain.Users;
using NSubstitute;
using static FleetConsole.Application.Tests.Credentials.TestTokens;

namespace FleetConsole.Application.Tests.Credentials;

/// <summary>
/// The credential command handlers over substituted repositories: 404 lookups (including a credential of another
/// cluster), name uniqueness, the version check, rotation in place and the in-use guard. The pipeline (validation,
/// read-only guard, commit) is covered by the behavior and integration tests.
/// </summary>
public sealed class CredentialCommandHandlerTests
{
    private const string OldToken = "sha256~fake-old-token";
    private const string NewToken = "sha256~fake-new-token";

    private readonly IClusterRepository _clusters = Substitute.For<IClusterRepository>();
    private readonly ICredentialRepository _credentials = Substitute.For<ICredentialRepository>();
    private readonly IGrantRepository _grants = Substitute.For<IGrantRepository>();
    private readonly ITokenProtector _protector = Substitute.For<ITokenProtector>();
    private readonly ICurrentUser _admin = FakeCurrentUser.SignedIn(UserRole.Admin, username: "root");
    private readonly Cluster _cluster = NewCluster("prod-eu-1");

    public CredentialCommandHandlerTests()
    {
        _protector.Protect(Arg.Any<SensitiveString>()).Returns(new EncryptedToken([1, 2, 3]));
        _clusters.GetByNameAsync(_cluster.Name, Arg.Any<CancellationToken>()).Returns(_cluster);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Add_stores_encrypted_token_with_fingerprint_and_metadata()
    {
        Credential? added = null;
        _credentials.Add(Arg.Do<Credential>(c => added = c));
        var token = Jwt("""{"sub":"system:serviceaccount:fleet:viewer","exp":1795084200}""");

        var result = await AddHandler().Handle(new AddCredentialCommand("prod-eu-1", "fleet-view", null, Sensitive(token)), Ct);

        result.IsSuccess.ShouldBeTrue();
        added.ShouldNotBeNull();
        added.Id.Value.ShouldBe(result.Value);
        added.Fingerprint.ShouldBe(TokenFingerprints.Compute(Sensitive(token)));
        added.Metadata.Subject.ShouldBe("system:serviceaccount:fleet:viewer");
        added.CreatedBy.ShouldBe("root");
        added.CreatedAt.ShouldBe(FixedClock.Now);
    }

    [Fact]
    public async Task Add_with_taken_name_is_NameTaken()
    {
        _credentials.NameExistsAsync(_cluster.Id, Arg.Any<CredentialName>(), Arg.Any<CancellationToken>()).Returns(true);

        var result = await AddHandler().Handle(new AddCredentialCommand("prod-eu-1", "fleet-view", null, Sensitive(OldToken)), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Credentials.NameTaken");
        _credentials.DidNotReceive().Add(Arg.Any<Credential>());
    }

    [Theory]
    [InlineData("other-cluster")]
    [InlineData("Not A Valid Name")]
    public async Task Add_to_unknown_cluster_is_Clusters_NotFound(string clusterName)
    {
        var result = await AddHandler().Handle(new AddCredentialCommand(clusterName, "fleet-view", null, Sensitive(OldToken)), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Clusters.NotFound");
    }

    [Fact]
    public async Task Rotate_replaces_the_token_in_place_and_raises_old_to_new_fingerprints()
    {
        var credential = Existing();

        var result = await RotateHandler().Handle(
            new RotateCredentialTokenCommand("prod-eu-1", credential.Id.Value, Sensitive(NewToken), credential.Version), Ct);

        result.IsSuccess.ShouldBeTrue();
        credential.Fingerprint.ShouldBe(TokenFingerprints.Compute(Sensitive(NewToken)));
        credential.RotatedBy.ShouldBe("root");
        credential.Metadata.ShouldBe(TokenMetadata.Opaque);
        var rotated = credential.DomainEvents.OfType<CredentialRotated>().ShouldHaveSingleItem();
        rotated.OldFingerprint.ShouldBe(TokenFingerprints.Compute(Sensitive(OldToken)).Value);
        rotated.NewFingerprint.ShouldBe(TokenFingerprints.Compute(Sensitive(NewToken)).Value);
    }

    [Fact]
    public async Task Rotate_with_stale_version_is_Concurrency_Conflict()
    {
        var credential = Existing();

        var result = await RotateHandler().Handle(
            new RotateCredentialTokenCommand("prod-eu-1", credential.Id.Value, Sensitive(NewToken), credential.Version + 1), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Concurrency.Conflict");
        credential.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public async Task Rotate_of_a_credential_of_another_cluster_is_Credentials_NotFound()
    {
        var foreign = Existing(NewCluster("dev-us-1"));

        var result = await RotateHandler().Handle(
            new RotateCredentialTokenCommand("prod-eu-1", foreign.Id.Value, Sensitive(NewToken), foreign.Version), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Credentials.NotFound");
    }

    [Fact]
    public async Task Delete_unused_credential_removes_it()
    {
        var credential = Existing();

        var result = await DeleteHandler().Handle(new DeleteCredentialCommand("prod-eu-1", credential.Id.Value), Ct);

        result.IsSuccess.ShouldBeTrue();
        _credentials.Received(1).Remove(credential);
        credential.DomainEvents.OfType<CredentialDeleted>().ShouldHaveSingleItem();
    }

    [Fact]
    public async Task Delete_used_credential_is_InUse_with_the_grant_count()
    {
        var credential = Existing();
        _grants.CountByCredentialAsync(credential.Id, Arg.Any<CancellationToken>()).Returns(3);

        var result = await DeleteHandler().Handle(new DeleteCredentialCommand("prod-eu-1", credential.Id.Value), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Credentials.InUse");
        result.Error.ShouldNotBeNull().Message.ShouldBe("Credential fleet-view is used by 3 grants. Re-assign or revoke them first.");
        _credentials.DidNotReceive().Remove(Arg.Any<Credential>());
    }

    [Fact]
    public async Task Delete_unknown_credential_is_Credentials_NotFound()
    {
        var result = await DeleteHandler().Handle(new DeleteCredentialCommand("prod-eu-1", Guid.NewGuid()), Ct);

        result.Error.ShouldNotBeNull().Code.ShouldBe("Credentials.NotFound");
    }

    private AddCredentialHandler AddHandler() => new(_clusters, _credentials, _protector, _admin, new FixedClock());

    private RotateCredentialTokenHandler RotateHandler() => new(_clusters, _credentials, _protector, _admin, new FixedClock());

    private DeleteCredentialHandler DeleteHandler() => new(_clusters, _credentials, _grants);

    private static Cluster NewCluster(string name)
    {
        var endpoint = ApiServerEndpoint.Create($"https://api.{name}.example.com:6443", null, false).Value;
        var cluster = Cluster.Register(
            ClusterName.Create(name).Value, null, endpoint, ClusterEnvironment.Production, null, null, true, "admin", FixedClock.Now);
        cluster.ClearDomainEvents();
        return cluster;
    }

    // A stored credential (holding OldToken) that the substituted repository returns by id.
    private Credential Existing(Cluster? cluster = null)
    {
        var credential = Credential.Add(
            cluster ?? _cluster,
            CredentialName.Create("fleet-view").Value,
            null,
            new EncryptedToken([9]),
            TokenFingerprints.Compute(Sensitive(OldToken)),
            TokenMetadata.Opaque,
            "admin",
            FixedClock.Now);
        credential.ClearDomainEvents();
        _credentials.GetByIdAsync(credential.Id, Arg.Any<CancellationToken>()).Returns(credential);
        return credential;
    }
}
