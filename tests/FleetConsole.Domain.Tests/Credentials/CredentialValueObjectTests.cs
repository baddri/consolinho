using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;

namespace FleetConsole.Domain.Tests.Credentials;

public sealed class CredentialValueObjectTests
{
    // ---- CredentialName (CRED-1) ------------------------------------------------------------------------------------

    private const string NameRule =
        "Use lowercase letters, digits and '-' (max 63), starting and ending with a letter or digit.";

    public static TheoryData<string?, string?> Names => new()
    {
        { "fleet-view", null },
        { "a", null },
        { new string('a', CredentialName.MaxLength), null },
        { null, "Name is required." },
        { " ", "Name is required." },
        { new string('a', CredentialName.MaxLength + 1), NameRule },
        { "Fleet-View", NameRule },
        { "fleet_view", NameRule },
        { "-fleet", NameRule },
        { "fleet-", NameRule },
    };

    [Theory]
    [MemberData(nameof(Names))]
    public void CredentialName_FollowsDnsLabelRules(string? value, string? error)
    {
        var result = CredentialName.Create(value);

        if (error is null)
        {
            result.Value.Value.ShouldBe(value);
            result.Value.ToString().ShouldBe(value);
        }
        else
        {
            result.Error.ShouldBe(new Error("Credentials.InvalidName", error, ErrorType.Validation));
        }
    }

    // ---- TokenFingerprint (ADR-0004) --------------------------------------------------------------------------------

    [Theory]
    [InlineData("0badc0de", true)]
    [InlineData("12345678", true)]
    [InlineData("abcdef09", true)]
    [InlineData("0BADC0DE", false)]
    [InlineData("0badc0d", false)]
    [InlineData("0badc0de1", false)]
    [InlineData("0badc0dg", false)]
    [InlineData("", false)]
    public void TokenFingerprint_IsEightLowercaseHexChars(string value, bool valid)
    {
        var result = TokenFingerprint.Create(value);

        result.IsSuccess.ShouldBe(valid);
        if (valid)
        {
            result.Value.Value.ShouldBe(value);
            result.Value.ToString().ShouldBe(value);
        }
        else
        {
            result.Error.ShouldNotBeNull().Code.ShouldBe("Credentials.InvalidFingerprint");
        }
    }

    // ---- EncryptedToken (CRED-2) ------------------------------------------------------------------------------------

    [Fact]
    public void EncryptedToken_CopiesInput_ComparesBytes_AndRedactsToString()
    {
        byte[] bytes = [1, 2, 3];
        var token = new EncryptedToken(bytes);
        bytes[0] = 9;

        token.Value.ShouldBe([(byte)1, 2, 3]);
        token.ShouldBe(new EncryptedToken([1, 2, 3]));
        token.GetHashCode().ShouldBe(new EncryptedToken([1, 2, 3]).GetHashCode());
        token.ShouldNotBe(new EncryptedToken([1, 2, 4]));
        token.ToString().ShouldBe("[redacted]");
    }

    [Fact]
    public void EncryptedToken_RejectsEmptyOrNull()
    {
        Should.Throw<ArgumentException>(() => new EncryptedToken([]));
        Should.Throw<ArgumentNullException>(() => new EncryptedToken(null!));
    }

    // ---- TokenMetadata.ServiceAccount (CRED-3) ----------------------------------------------------------------------

    [Theory]
    [InlineData("system:serviceaccount:fleet:viewer", "fleet/viewer")]
    [InlineData("system:serviceaccount:openshift-monitoring:prometheus-k8s", "openshift-monitoring/prometheus-k8s")]
    [InlineData("system:serviceaccount:fleet:", null)]
    [InlineData("system:serviceaccount::viewer", null)]
    [InlineData("system:serviceaccount:fleet", null)]
    [InlineData("system:serviceaccount:a:b:c", null)]
    [InlineData("system:serviceaccounts:fleet:viewer", null)]
    [InlineData("System:ServiceAccount:fleet:viewer", null)]
    [InlineData("alice", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void ServiceAccount_IsDerivedFromSaSubjects(string? subject, string? expected)
    {
        new TokenMetadata(TokenType.Jwt, subject, null, null).ServiceAccount.ShouldBe(expected);
    }

    [Fact]
    public void Opaque_HasNoClaims()
    {
        TokenMetadata.Opaque.ShouldBe(new TokenMetadata(TokenType.Opaque, null, null, null));
        TokenMetadata.Opaque.ServiceAccount.ShouldBeNull();
    }

    // ---- TokenMetadata.StatusAt (CRED-4) ----------------------------------------------------------------------------

    private static readonly DateTimeOffset Now = DomainTestData.Now;
    private static readonly TimeSpan Window = TimeSpan.FromDays(14);

    public static TheoryData<TokenType, int?, CredentialExpiryStatus> Statuses => new()
    {
        // ExpiresAt is given as minutes relative to Now; null = no exp claim.
        { TokenType.Opaque, null, CredentialExpiryStatus.Unknown },
        { TokenType.Opaque, -60, CredentialExpiryStatus.Unknown },
        { TokenType.Jwt, null, CredentialExpiryStatus.NoExpiry },
        { TokenType.Jwt, -60 * 24, CredentialExpiryStatus.Expired },
        { TokenType.Jwt, 0, CredentialExpiryStatus.Expired },
        { TokenType.Jwt, 1, CredentialExpiryStatus.ExpiringSoon },
        { TokenType.Jwt, 60 * 24 * 7, CredentialExpiryStatus.ExpiringSoon },
        { TokenType.Jwt, 60 * 24 * 14, CredentialExpiryStatus.ExpiringSoon },
        { TokenType.Jwt, (60 * 24 * 14) + 1, CredentialExpiryStatus.Ok },
        { TokenType.Jwt, 60 * 24 * 365, CredentialExpiryStatus.Ok },
    };

    [Theory]
    [MemberData(nameof(Statuses))]
    public void StatusAt_ClassifiesExpiry(TokenType type, int? expiresInMinutes, CredentialExpiryStatus expected)
    {
        DateTimeOffset? expiresAt = expiresInMinutes is { } minutes ? Now.AddMinutes(minutes) : null;
        var metadata = new TokenMetadata(type, null, null, expiresAt);

        metadata.StatusAt(Now, Window).ShouldBe(expected);
    }

    [Fact]
    public void StatusAt_WithZeroWindow_NeverExpiringSoon()
    {
        new TokenMetadata(TokenType.Jwt, null, null, Now.AddSeconds(1)).StatusAt(Now, TimeSpan.Zero)
            .ShouldBe(CredentialExpiryStatus.Ok);
    }

    [Fact]
    public void StatusAt_RejectsNegativeWindow()
    {
        Should.Throw<ArgumentOutOfRangeException>(() => TokenMetadata.Opaque.StatusAt(Now, TimeSpan.FromDays(-1)));
    }

    // ---- ConnectionTestSummary (CLU-4) ------------------------------------------------------------------------------

    [Fact]
    public void ConnectionTestSummary_IsStale_OnlyWhenSettingsChangedAfterTest()
    {
        var summary = new ConnectionTestSummary(Now, true, null, CapabilityLevel.ClusterWideView);

        summary.IsStaleSince(Now.AddSeconds(1)).ShouldBeTrue();
        summary.IsStaleSince(Now).ShouldBeFalse();
        summary.IsStaleSince(Now.AddDays(-1)).ShouldBeFalse();
    }

    // ---- InspectNamespaces (NST-2/5) --------------------------------------------------------------------------------

    [Fact]
    public void InspectNamespaces_NullOrEmpty_IsEmpty()
    {
        InspectNamespaces.Create(null).Value.ShouldBeSameAs(InspectNamespaces.Empty);
        InspectNamespaces.Create([]).Value.ShouldBeSameAs(InspectNamespaces.Empty);
        InspectNamespaces.Empty.Values.ShouldBeEmpty();
    }

    [Fact]
    public void InspectNamespaces_Trims_AndRemovesDuplicates_KeepingFirstOrder()
    {
        var result = InspectNamespaces.Create([" team-b ", "team-a", "team-b", "\tteam-a"]);

        result.Value.Values.ShouldBe(["team-b", "team-a"]);
    }

    [Fact]
    public void InspectNamespaces_ReportsEveryBadEntry_ByInputIndex()
    {
        var result = InspectNamespaces.Create(["ok", "Team_A", " ", "ok", new string('a', 64), null!]);

        var errors = result.Error.ShouldBeOfType<ValidationError>().Errors;
        errors.Keys.ShouldBe(["inspectNamespaces[1]", "inspectNamespaces[2]", "inspectNamespaces[4]", "inspectNamespaces[5]"], ignoreOrder: true);
        errors["inspectNamespaces[1]"].ShouldBe([
            "'Team_A' is not a valid namespace name: at most 63 characters: lowercase letters, digits and '-', starting and ending with a letter or digit.",
        ]);
        errors["inspectNamespaces[2]"].ShouldBe([InspectNamespaces.BlankMessage]);
        errors["inspectNamespaces[5]"].ShouldBe([InspectNamespaces.BlankMessage]);
    }

    [Fact]
    public void InspectNamespaces_AcceptsTenDistinct_RejectsEleven_CountingAfterDedup()
    {
        var ten = Enumerable.Range(0, 10).Select(i => $"ns-{i}").ToList();

        InspectNamespaces.Create([.. ten, "ns-0"]).Value.Values.Count.ShouldBe(10);
        InspectNamespaces.Create([new string('a', 63)]).IsSuccess.ShouldBeTrue();

        var errors = InspectNamespaces.Create([.. ten, "ns-10", "Bad!"]).Error.ShouldBeOfType<ValidationError>().Errors;
        errors["inspectNamespaces"].ShouldBe(["Enter at most 10 namespaces."]);
        errors.ShouldContainKey("inspectNamespaces[11]");
    }

    [Fact]
    public void InspectNamespaces_CapsEntryErrors_ButStillFails()
    {
        var input = Enumerable.Range(0, 1000).Select(i => i % 2 == 0 ? $"BAD{i}" : $"ns-{i}").ToList();

        var errors = InspectNamespaces.Create(input).Error.ShouldBeOfType<ValidationError>().Errors;

        errors.Keys.Count(k => k.StartsWith("inspectNamespaces[", StringComparison.Ordinal)).ShouldBe(InspectNamespaces.MaxEntryErrors);
        errors.ShouldContainKey("inspectNamespaces[0]");
        errors["inspectNamespaces"].ShouldBe(["Enter at most 10 namespaces."]);
        InspectNamespaces.Create([.. Enumerable.Range(0, 11).Select(i => $"ns-{i}"), "BAD"]).IsFailure.ShouldBeTrue();
    }

    [Fact]
    public void InspectNamespaces_HasValueEquality()
    {
        var a = InspectNamespaces.Create(["x", "y"]).Value;

        a.ShouldBe(InspectNamespaces.Create(["x", " y "]).Value);
        a.GetHashCode().ShouldBe(InspectNamespaces.Create(["x", "y"]).Value.GetHashCode());
        a.ShouldNotBe(InspectNamespaces.Create(["y", "x"]).Value);
        a.ShouldNotBe(InspectNamespaces.Empty);
    }
}
