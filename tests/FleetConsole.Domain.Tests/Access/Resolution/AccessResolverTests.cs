using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Credentials;
using static FleetConsole.Domain.Access.AccessMode;
using static FleetConsole.Domain.Access.Resolution.CandidateOutcome;

namespace FleetConsole.Domain.Tests.Access.Resolution;

public sealed class AccessResolverTests
{
    /// <summary>Expected verdict, by candidate number (see <see cref="Id"/>).</summary>
    private sealed record V(int Id, CandidateOutcome Outcome, string? BeatenBy = null);

    /// <summary>Expected result; <c>Verdicts</c> empty means "no access" (null resolution).</summary>
    private sealed record Expected(AccessMode Mode, bool Narrowed, bool Tie, params V[] Verdicts);

    private sealed record Case(AccessCandidate[] Candidates, string[] Groups, bool ReadOnlyFlag, Expected? Expected);

    private static readonly Dictionary<string, Case> Cases = new()
    {
        ["no candidates"] = new([], ["sre"], false, null),
        ["non-member group only"] = new([Group(1, "dev", 10, ReadWrite)], ["sre"], false, null),
        ["group name differs only in case is not a member"] = new([Group(1, "SRE", 10, ReadWrite)], ["sre"], false, null),
        ["system group candidate ignored even if listed"] =
            new([Group(1, "system:authenticated", 10, ReadWrite)], ["system:authenticated"], false, null),
        ["system group candidate ignored in any case"] =
            new([Group(1, "System:Authenticated", 10, ReadWrite)], ["System:Authenticated"], false, null),
        ["system groups of user dropped, real member kept"] = new(
            [Group(1, "system:authenticated", 99, ReadWrite), Group(2, "sre", 5, ReadOnly)],
            ["system:authenticated", "sre"], false,
            new(ReadOnly, false, false, new V(2, Winner))),
        ["non-member candidates are not in verdicts"] = new(
            [Group(1, "dev", 99, ReadWrite), Group(2, "sre", 5, ReadWrite)], ["sre"], false,
            new(ReadWrite, false, false, new V(2, Winner))),
        ["direct only"] = new([Direct(1, ReadWrite)], [], false, new(ReadWrite, false, false, new V(1, Winner))),
        ["direct RO beats RW group (PREC-3)"] = new(
            [Group(1, "sre", 100, ReadWrite), Direct(2, ReadOnly), Group(3, "ops", 5, ReadWrite)], ["sre", "ops"], false,
            new(ReadOnly, false, false, new V(2, Winner), new V(1, OverriddenByDirectGrant), new V(3, OverriddenByDirectGrant))),
        ["direct wins over tied groups, no tie reported"] = new(
            [Group(1, "sre", 10, ReadWrite), Group(2, "ops", 10, ReadWrite), Direct(3, ReadWrite)], ["sre", "ops"], false,
            new(ReadWrite, false, false, new V(3, Winner), new V(1, OverriddenByDirectGrant), new V(2, OverriddenByDirectGrant))),
        ["highest priority wins (PREC-4)"] = new(
            [Group(1, "ops", 5, ReadOnly), Group(2, "sre", 20, ReadWrite), Group(3, "dev", 10, ReadOnly)],
            ["ops", "sre", "dev"], false,
            new(ReadWrite, false, false, new V(2, Winner), new V(3, LowerPriority, "sre"), new V(1, LowerPriority, "sre"))),
        ["negative priorities order correctly"] = new(
            [Group(1, "ops", -5, ReadWrite), Group(2, "sre", -1, ReadOnly)], ["ops", "sre"], false,
            new(ReadOnly, false, false, new V(2, Winner), new V(1, LowerPriority, "sre"))),
        ["tie: read-only wins (PREC-5)"] = new(
            [Group(1, "sre", 10, ReadWrite), Group(2, "ops", 10, ReadOnly), Group(3, "dev", 1, ReadWrite)],
            ["sre", "ops", "dev"], false,
            new(ReadOnly, false, true, new V(2, Winner), new V(1, TieReadOnlyWins, "ops"), new V(3, LowerPriority, "ops"))),
        ["tie: equal modes, lowest id wins (PREC-5)"] = new(
            [Group(3, "ops", 10, ReadWrite), Group(1, "sre", 10, ReadWrite)], ["sre", "ops"], false,
            new(ReadWrite, false, true, new V(1, Winner), new V(3, TieBrokenById, "sre"))),
        ["tie: two RO and one RW, lowest RO id wins"] = new(
            [Group(1, "a", 10, ReadWrite), Group(2, "b", 10, ReadOnly), Group(3, "c", 10, ReadOnly)], ["a", "b", "c"], false,
            new(ReadOnly, false, true, new V(2, Winner), new V(1, TieReadOnlyWins, "b"), new V(3, TieBrokenById, "b"))),
        ["tie below the top is not a tie"] = new(
            [Group(1, "a", 20, ReadWrite), Group(2, "b", 10, ReadOnly), Group(3, "c", 10, ReadOnly)], ["a", "b", "c"], false,
            new(ReadWrite, false, false, new V(1, Winner), new V(2, LowerPriority, "a"), new V(3, LowerPriority, "a"))),
        ["RO flag narrows RW group winner (PREC-6)"] = new(
            [Group(1, "sre", 10, ReadWrite)], ["sre"], true, new(ReadOnly, true, false, new V(1, Winner))),
        ["RO flag narrows RW direct winner (PREC-6)"] = new(
            [Direct(1, ReadWrite)], [], true, new(ReadOnly, true, false, new V(1, Winner))),
        ["RO flag on RO winner is not narrowing"] = new(
            [Direct(1, ReadOnly)], [], true, new(ReadOnly, false, false, new V(1, Winner))),
    };

    public static TheoryData<string> CaseNames => new(Cases.Keys);

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void Resolve_AppliesPrecedenceRules(string name)
    {
        var @case = Cases[name];

        var resolution = AccessResolver.Resolve(@case.Candidates, @case.Groups, @case.ReadOnlyFlag);

        if (@case.Expected is null)
        {
            resolution.ShouldBeNull();
            return;
        }

        var expected = @case.Expected;
        resolution.ShouldNotBeNull();
        resolution.Winner.GrantId.ShouldBe(Id(expected.Verdicts[0].Id));
        resolution.EffectiveMode.ShouldBe(expected.Mode);
        resolution.NarrowedByReadOnlyFlag.ShouldBe(expected.Narrowed);
        resolution.TieDetected.ShouldBe(expected.Tie);
        resolution.Verdicts
            .Select(v => new V(Number(v.Candidate.GrantId), v.Outcome, v.BeatenByGroup))
            .ToArray()
            .ShouldBe(expected.Verdicts);
        resolution.Verdicts[0].Candidate.ShouldBeSameAs(resolution.Winner);
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void Resolve_IsIndependentOfInputOrder(string name)
    {
        var @case = Cases[name];
        var baseline = AccessResolver.Resolve(@case.Candidates, @case.Groups, @case.ReadOnlyFlag);
        var random = new Random(4242);

        for (var i = 0; i < 10; i++)
        {
            var candidates = @case.Candidates.OrderBy(_ => random.Next()).ToArray();
            var groups = @case.Groups.OrderBy(_ => random.Next()).ToArray();

            var shuffled = AccessResolver.Resolve(candidates, groups, @case.ReadOnlyFlag);

            if (baseline is null)
            {
                shuffled.ShouldBeNull();
                continue;
            }

            shuffled.ShouldNotBeNull();
            shuffled.Winner.ShouldBe(baseline.Winner);
            shuffled.EffectiveMode.ShouldBe(baseline.EffectiveMode);
            shuffled.TieDetected.ShouldBe(baseline.TieDetected);
            shuffled.Verdicts.ToArray().ShouldBe(baseline.Verdicts.ToArray());
        }
    }

    [Fact]
    public void Resolve_TwoDirectCandidates_Throws()
    {
        Should.Throw<InvalidOperationException>(() =>
            AccessResolver.Resolve([Direct(1, ReadOnly), Direct(2, ReadWrite)], [], false));
    }

    [Fact]
    public void Resolve_GroupCandidateWithoutPriority_Throws()
    {
        var candidate = new AccessCandidate(Id(1), "sre", null, ReadOnly, new CredentialId(Guid.NewGuid()));

        Should.Throw<ArgumentException>(() => AccessResolver.Resolve([candidate], ["sre"], false));
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void Resolve_GroupCandidateWithBlankName_Throws(string groupName)
    {
        Should.Throw<ArgumentException>(() => AccessResolver.Resolve([Group(1, groupName, 1, ReadOnly)], [groupName], false));
    }

    [Fact]
    public void Resolve_WinnerCarriesItsCredential()
    {
        var resolution = AccessResolver.Resolve([Group(1, "sre", 1, ReadOnly), Group(2, "ops", 2, ReadOnly)], ["sre", "ops"], false);

        resolution.ShouldNotBeNull();
        resolution.Winner.CredentialId.ShouldBe(CredentialOf(2));
    }

    /// <summary>Deterministic grant ids: a higher number is a higher (newer) Guid, like Guid v7 ids created later.</summary>
    private static GrantId Id(int n) => new(new Guid($"0190a000-0000-7000-8000-{n:x12}"));

    private static int Number(GrantId id) => Convert.ToInt32(id.Value.ToString()[^12..], 16);

    private static CredentialId CredentialOf(int n) => new(new Guid($"0190b000-0000-7000-8000-{n:x12}"));

    private static AccessCandidate Direct(int n, AccessMode mode) => new(Id(n), null, null, mode, CredentialOf(n));

    private static AccessCandidate Group(int n, string group, int priority, AccessMode mode) =>
        new(Id(n), group, priority, mode, CredentialOf(n));
}
