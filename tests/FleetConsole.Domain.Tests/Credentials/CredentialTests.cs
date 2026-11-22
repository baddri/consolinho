using System.Runtime.CompilerServices;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Credentials.Events;
using static FleetConsole.Domain.Tests.DomainTestData;

namespace FleetConsole.Domain.Tests.Credentials;

public sealed class CredentialTests
{
    private static readonly DateTimeOffset Later = Now.AddDays(3);

    // ---- add (CRED-1/3) ---------------------------------------------------------------------------------------------

    [Fact]
    public void Add_SetsState_AndRaisesCredentialAdded()
    {
        var cluster = NewCluster();
        var token = Token(7);
        var metadata = JwtMetadata();
        var namespaces = Namespaces("team-a", "team-b");

        var credential = Credential.Add(
            cluster, CredentialName.Create("fleet-view").Value, "Read-only SA", token, Fingerprint("0badc0de"), metadata,
            namespaces, "admin", Now);

        credential.Id.Value.ShouldNotBe(Guid.Empty);
        credential.ClusterId.ShouldBe(cluster.Id);
        credential.Name.Value.ShouldBe("fleet-view");
        credential.Description.ShouldBe("Read-only SA");
        credential.Token.ShouldBe(token);
        credential.Fingerprint.Value.ShouldBe("0badc0de");
        credential.Metadata.ShouldBe(metadata);
        credential.CreatedAt.ShouldBe(Now);
        credential.CreatedBy.ShouldBe("admin");
        credential.RotatedAt.ShouldBeNull();
        credential.RotatedBy.ShouldBeNull();
        credential.LastTest.ShouldBeNull();
        credential.InspectNamespaces.ShouldBe(namespaces);
        credential.DomainEvents.ShouldBe([
            new CredentialAdded(
                credential.Id, cluster.Id, "prod-eu-1", "fleet-view", "0badc0de", TokenType.Jwt, "fleet/viewer", namespaces.Values),
        ]);
    }

    [Fact]
    public void Add_OpaqueToken_OnDisabledCluster_IsAllowed()
    {
        var cluster = NewCluster(isEnabled: false);

        var credential = Credential.Add(
            cluster, CredentialName.Create("legacy").Value, "  ", Token(1), Fingerprint("12345678"), TokenMetadata.Opaque,
            InspectNamespaces.Empty, "admin", Now);

        credential.Description.ShouldBeNull();
        credential.InspectNamespaces.Values.ShouldBeEmpty();
        var added = credential.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<CredentialAdded>();
        added.TokenType.ShouldBe(TokenType.Opaque);
        added.ServiceAccount.ShouldBeNull();
    }

    [Fact]
    public void Add_GuardsArguments()
    {
        var cluster = NewCluster();
        var name = CredentialName.Create("x").Value;

        Should.Throw<ArgumentException>(() =>
            Credential.Add(cluster, name, null, Token(1), Fingerprint("12345678"), JwtMetadata(), InspectNamespaces.Empty, " ", Now));
        Should.Throw<ArgumentException>(() =>
            Credential.Add(cluster, name, null, Token(1), Fingerprint("12345678"), JwtMetadata(), InspectNamespaces.Empty, "admin", default));
        Should.Throw<ArgumentNullException>(() =>
            Credential.Add(cluster, name, null, Token(1), Fingerprint("12345678"), JwtMetadata(), null!, "admin", Now));
        Should.Throw<ArgumentOutOfRangeException>(() =>
            Credential.Add(cluster, name, new string('d', Credential.MaxDescriptionLength + 1), Token(1),
                Fingerprint("12345678"), JwtMetadata(), InspectNamespaces.Empty, "admin", Now));
    }

    [Fact]
    public void ClusterId_HasNoPublicSetter_AndIsInitOnly()
    {
        var setter = typeof(Credential).GetProperty(nameof(Credential.ClusterId))!.SetMethod.ShouldNotBeNull();

        setter.IsPublic.ShouldBeFalse();
        setter.ReturnParameter.GetRequiredCustomModifiers().ShouldContain(typeof(IsExternalInit));
    }

    // ---- rotate (CRED-5) --------------------------------------------------------------------------------------------

    [Fact]
    public void Rotate_ReplacesToken_ResetsLastTest_KeepsNamespaces_AndRaisesCredentialRotated()
    {
        var credential = NewCredential(NewCluster(), fingerprint: "0badc0de");
        var namespaces = Namespaces("team-a");
        credential.RecordTest(new ConnectionTestSummary(Now, true, null, CapabilityLevel.ClusterWideView), namespaces, "prod-eu-1");
        credential.ClearDomainEvents();
        var id = credential.Id;
        var newMetadata = new TokenMetadata(TokenType.Jwt, "system:serviceaccount:fleet:viewer2", Later, null);

        credential.Rotate(Token(9), Fingerprint("feedbeef"), newMetadata, "prod-eu-1", "bob", Later);

        credential.Id.ShouldBe(id);
        credential.Token.ShouldBe(Token(9));
        credential.Fingerprint.Value.ShouldBe("feedbeef");
        credential.Metadata.ShouldBe(newMetadata);
        credential.RotatedAt.ShouldBe(Later);
        credential.RotatedBy.ShouldBe("bob");
        credential.LastTest.ShouldBeNull();
        credential.InspectNamespaces.ShouldBe(namespaces);
        credential.CreatedBy.ShouldBe("admin");
        credential.DomainEvents.ShouldBe([
            new CredentialRotated(id, credential.ClusterId, "prod-eu-1", "fleet-view", "0badc0de", "feedbeef"),
        ]);
    }

    [Fact]
    public void Rotate_IsAlwaysAChange_EvenWithTheSameFingerprint()
    {
        // The Domain cannot prove two tokens equal (it never sees plaintext), so every rotation is audited.
        var credential = NewCredential(NewCluster(), fingerprint: "0badc0de");

        credential.Rotate(Token(2), Fingerprint("0badc0de"), JwtMetadata(), "prod-eu-1", "bob", Later);

        credential.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<CredentialRotated>();
    }

    // ---- test (TEST-5) ----------------------------------------------------------------------------------------------

    [Fact]
    public void RecordTest_StoresSummary_ReplacesNamespaces_AndRaisesCredentialTestedEveryTime()
    {
        var credential = NewCredential(NewCluster());
        var failed = new ConnectionTestSummary(Now, false, ConnectionTestStep.Authentication, null);
        var passed = new ConnectionTestSummary(Later, true, null, CapabilityLevel.ClusterAdmin);
        var first = Namespaces("team-a", "team-b");
        var second = Namespaces("team-c");

        credential.RecordTest(failed, first, "prod-eu-1");
        credential.RecordTest(passed, second, "prod-eu-1");
        credential.RecordTest(passed, second, "prod-eu-1");

        credential.LastTest.ShouldBe(passed);
        credential.InspectNamespaces.ShouldBe(second);
        credential.DomainEvents.Count.ShouldBe(3);
        credential.DomainEvents.First().ShouldBe(new CredentialTested(
            credential.Id, credential.ClusterId, "prod-eu-1", "fleet-view", false, ConnectionTestStep.Authentication, null,
            first.Values));
        credential.DomainEvents.Last().ShouldBe(new CredentialTested(
            credential.Id, credential.ClusterId, "prod-eu-1", "fleet-view", true, null, CapabilityLevel.ClusterAdmin,
            second.Values));
    }

    [Fact]
    public void RecordTest_WithEmptyList_ClearsSavedNamespaces()
    {
        var credential = NewCredential(NewCluster());
        credential.RecordTest(new ConnectionTestSummary(Now, true, null, null), Namespaces("team-a"), "prod-eu-1");

        credential.RecordTest(new ConnectionTestSummary(Later, true, null, null), InspectNamespaces.Empty, "prod-eu-1");

        credential.InspectNamespaces.Values.ShouldBeEmpty();
        credential.DomainEvents.Last().ShouldBeOfType<CredentialTested>().InspectNamespaces.ShouldBeEmpty();
    }

    [Fact]
    public void RecordTest_RejectsInconsistentSummaries()
    {
        var credential = NewCredential(NewCluster());

        Should.Throw<ArgumentException>(() =>
            credential.RecordTest(new ConnectionTestSummary(Now, true, ConnectionTestStep.Identity, null), InspectNamespaces.Empty, "prod-eu-1"));
        Should.Throw<ArgumentException>(() =>
            credential.RecordTest(new ConnectionTestSummary(Now, false, null, null), InspectNamespaces.Empty, "prod-eu-1"));
        Should.Throw<ArgumentException>(() =>
            credential.RecordTest(new ConnectionTestSummary(default, true, null, null), InspectNamespaces.Empty, "prod-eu-1"));
        credential.LastTest.ShouldBeNull();
        credential.DomainEvents.ShouldBeEmpty();
    }

    // ---- delete (CRED-6) --------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(1, "Credential fleet-view is used by 1 grant. Re-assign or revoke them first.")]
    [InlineData(3, "Credential fleet-view is used by 3 grants. Re-assign or revoke them first.")]
    public void MarkForDeletion_WhileInUse_FailsWithInUse_AndRaisesNoEvent(int grantCount, string message)
    {
        var credential = NewCredential(NewCluster());

        var result = credential.MarkForDeletion(grantCount, "prod-eu-1");

        result.Error.ShouldBe(new Error("Credentials.InUse", message, ErrorType.Conflict));
        credential.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void MarkForDeletion_WhenUnused_RaisesCredentialDeleted()
    {
        var credential = NewCredential(NewCluster(), fingerprint: "0badc0de");

        var result = credential.MarkForDeletion(0, "prod-eu-1");

        result.IsSuccess.ShouldBeTrue();
        credential.DomainEvents.ShouldBe([
            new CredentialDeleted(credential.Id, credential.ClusterId, "prod-eu-1", "fleet-view", "0badc0de"),
        ]);
    }

    [Fact]
    public void MarkForDeletion_GuardsCount()
    {
        Should.Throw<ArgumentOutOfRangeException>(() => NewCredential(NewCluster()).MarkForDeletion(-1, "prod-eu-1"));
    }

    // ---- errors (contract §2) ---------------------------------------------------------------------------------------

    [Fact]
    public void Errors_HaveContractCodesAndTypes()
    {
        CredentialErrors.NotFound().Code.ShouldBe("Credentials.NotFound");
        CredentialErrors.NotFound().Type.ShouldBe(ErrorType.NotFound);
        CredentialErrors.NameTaken("fleet-view", "prod-eu-1").ShouldBe(new Error(
            "Credentials.NameTaken", "Credential fleet-view already exists on cluster prod-eu-1.", ErrorType.Conflict));
    }

    private static InspectNamespaces Namespaces(params string[] names) => InspectNamespaces.Create(names).Value;
}
