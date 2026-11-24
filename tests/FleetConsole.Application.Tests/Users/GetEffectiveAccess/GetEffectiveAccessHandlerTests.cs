using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Access;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Auth;
using FleetConsole.Application.Tests.Clusters;
using FleetConsole.Application.Users.GetEffectiveAccess;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Logging.Abstractions;

namespace FleetConsole.Application.Tests.Users.GetEffectiveAccess;

/// <summary>
/// EFF-1..5 on <see cref="GetEffectiveAccessHandler"/> over an in-memory read model and the real
/// <see cref="ClusterAccessReader"/>: source, outcomes, <c>beatenBy</c>, narrowing, ordering, <c>groupsAsOf</c> and the
/// not-found / no-access cases. In memory there is no unique priority index, so ties can be seeded directly.
/// </summary>
public sealed class GetEffectiveAccessHandlerTests
{
    private readonly InMemoryReadModel _model = new();
    private readonly User _alice = AuthTestUsers.PreCreated("alice");
    private readonly Cluster _c1 = TestClusters.Create("c1");
    private readonly Cluster _c2 = TestClusters.Create("c2");

    public GetEffectiveAccessHandlerTests()
    {
        _alice.ReplaceGroups(["sre", "ops", "dev"]);
        _model.UserRows.Add(_alice);
        // Inserted out of name order: the response is sorted by cluster name.
        _model.ClusterRows.AddRange([_c2, _c1]);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Direct_grant_wins_and_every_group_grant_is_overridden()
    {
        var direct = AddDirect(_alice, _c1, AccessMode.ReadOnly, "sa-direct");
        var sre = AddGroup("sre", _c1, AccessMode.ReadWrite, 50, "sa-sre");
        var ops = AddGroup("ops", _c1, AccessMode.ReadOnly, 10, "sa-ops");

        var c1 = (await HandleAsync("alice")).Clusters.ShouldHaveSingleItem();

        c1.ClusterName.ShouldBe("c1");
        c1.AccessMode.ShouldBe(AccessMode.ReadOnly);
        c1.NarrowedByReadOnlyFlag.ShouldBeFalse();
        c1.Source.ShouldBe(new AccessSourceDto(GrantSubjectKind.User, null, null));
        c1.CredentialId.ShouldBe(direct.CredentialId.Value);
        c1.CredentialName.ShouldBe("sa-direct");
        c1.Candidates.ShouldBe(
        [
            new AccessCandidateDto(direct.Id.Value, GrantSubjectKind.User, "alice", null, AccessMode.ReadOnly, "sa-direct", CandidateOutcome.Winner, null),
            new AccessCandidateDto(sre.Id.Value, GrantSubjectKind.Group, "sre", 50, AccessMode.ReadWrite, "sa-sre", CandidateOutcome.OverriddenByDirectGrant, null),
            new AccessCandidateDto(ops.Id.Value, GrantSubjectKind.Group, "ops", 10, AccessMode.ReadOnly, "sa-ops", CandidateOutcome.OverriddenByDirectGrant, null),
        ]);
    }

    [Fact]
    public async Task Top_priority_tie_resolves_to_read_only_and_names_the_winner_on_every_loser()
    {
        var sre = AddGroup("sre", _c2, AccessMode.ReadWrite, 20, "sa-sre");
        var ops = AddGroup("ops", _c2, AccessMode.ReadOnly, 20, "sa-ops");
        var dev = AddGroup("dev", _c2, AccessMode.ReadWrite, 5, "sa-dev");

        var c2 = (await HandleAsync("alice")).Clusters.ShouldHaveSingleItem();

        c2.AccessMode.ShouldBe(AccessMode.ReadOnly);
        c2.Source.ShouldBe(new AccessSourceDto(GrantSubjectKind.Group, "ops", 20));
        c2.CredentialName.ShouldBe("sa-ops");
        c2.Candidates.Select(c => (c.GrantId, c.Outcome, c.BeatenBy)).ShouldBe(
        [
            (ops.Id.Value, CandidateOutcome.Winner, (string?)null),
            (sre.Id.Value, CandidateOutcome.TieReadOnlyWins, "ops"),
            (dev.Id.Value, CandidateOutcome.LowerPriority, "ops"),
        ]);
    }

    [Fact]
    public async Task Tie_with_the_same_mode_is_broken_by_grant_id()
    {
        var a = AddGroup("sre", _c2, AccessMode.ReadOnly, 20, "sa-sre");
        var b = AddGroup("ops", _c2, AccessMode.ReadOnly, 20, "sa-ops");
        // v7 ids made in the same millisecond aren't ordered by creation, so compare ids rather than assume.
        var (winner, loser) = a.Id.Value.CompareTo(b.Id.Value) < 0 ? (a, b) : (b, a);

        var c2 = (await HandleAsync("alice")).Clusters.ShouldHaveSingleItem();

        c2.Candidates.Select(c => (c.GrantId, c.Outcome, c.BeatenBy)).ShouldBe(
        [
            (winner.Id.Value, CandidateOutcome.Winner, (string?)null),
            (loser.Id.Value, CandidateOutcome.TieBrokenById, winner.GroupName!.Value),
        ]);
    }

    [Fact]
    public async Task Stored_read_only_flag_narrows_a_read_write_winner()
    {
        var carol = AuthTestUsers.PreCreated("carol", isReadOnly: true);
        carol.ReplaceGroups(["sre"]);
        _model.UserRows.Add(carol);
        AddGroup("sre", _c1, AccessMode.ReadWrite, 10, "sa-sre");

        var result = await HandleAsync("carol");

        result.UserIsReadOnly.ShouldBeTrue();
        var c1 = result.Clusters.ShouldHaveSingleItem();
        c1.AccessMode.ShouldBe(AccessMode.ReadOnly);
        c1.NarrowedByReadOnlyFlag.ShouldBeTrue();
        c1.Candidates.ShouldHaveSingleItem().AccessMode.ShouldBe(AccessMode.ReadWrite);
    }

    [Fact]
    public async Task Clusters_are_sorted_by_name_and_disabled_or_unmatched_ones_are_absent()
    {
        var disabled = TestClusters.Create("c0", isEnabled: false);
        _model.ClusterRows.Add(disabled);
        AddDirect(_alice, _c2, AccessMode.ReadWrite, "sa-2");
        AddDirect(_alice, _c1, AccessMode.ReadWrite, "sa-1");
        AddDirect(_alice, disabled, AccessMode.ReadWrite, "sa-0");
        AddGroup("not-a-member", _c1, AccessMode.ReadWrite, 999, "sa-other");

        var result = await HandleAsync("alice");

        result.Clusters.Select(c => c.ClusterName).ShouldBe(["c1", "c2"]);
        result.Clusters[0].Candidates.ShouldHaveSingleItem().SubjectName.ShouldBe("alice");
        result.Groups.ShouldBe(["sre", "ops", "dev"]);
        result.UserStatus.ShouldBe(UserStatus.Pending);
    }

    [Fact]
    public async Task No_access_and_deactivated_user_have_no_clusters()
    {
        var deactivated = AuthTestUsers.Deactivated("dora");
        _model.UserRows.Add(deactivated);
        AddDirect(deactivated, _c1, AccessMode.ReadWrite, "sa-dora");

        (await HandleAsync("alice")).Clusters.ShouldBeEmpty();
        var dora = await HandleAsync("dora");
        dora.Clusters.ShouldBeEmpty();
        dora.UserStatus.ShouldBe(UserStatus.Deactivated);
    }

    [Theory]
    [InlineData("nobody")]
    [InlineData("Not A Username!")]
    public async Task Unknown_or_invalid_username_is_not_found(string username)
    {
        var result = await Handler().Handle(new GetEffectiveAccessQuery(username), Ct);

        result.Error!.Code.ShouldBe("Users.NotFound");
    }

    [Fact]
    public async Task Groups_as_of_is_null_before_login_then_last_login_then_the_later_check()
    {
        (await HandleAsync("alice")).GroupsAsOf.ShouldBeNull();

        var bob = AuthTestUsers.LoggedInBefore("bob", adminSource: null);
        _model.UserRows.Add(bob);
        (await HandleAsync("bob")).GroupsAsOf.ShouldBe(AuthTestUsers.Earlier);

        var checkedAt = AuthTestUsers.Earlier.AddHours(3);
        _model.CheckRows.Add(new UserGroupCheck(bob.Id, checkedAt));
        (await HandleAsync("bob")).GroupsAsOf.ShouldBe(checkedAt);
    }

    private async Task<EffectiveAccessDto> HandleAsync(string username)
    {
        var result = await Handler().Handle(new GetEffectiveAccessQuery(username), Ct);
        result.IsSuccess.ShouldBeTrue(result.IsFailure ? result.Error.Message : null);
        return result.Value;
    }

    private GetEffectiveAccessHandler Handler() =>
        new(_model, new ClusterAccessReader(_model, NullLogger<ClusterAccessReader>.Instance));

    private Grant AddDirect(User user, Cluster cluster, AccessMode mode, string credentialName)
    {
        var credential = AddCredential(cluster, credentialName);
        var grant = Grant.Create(user, cluster, credential, mode, new HashSet<ClusterId>(), "admin", FixedClock.Now).Value;
        _model.GrantRows.Add(grant);
        return grant;
    }

    // Empty slots: the in-memory model has no unique priority index, so ties can be seeded (PREC-5).
    private Grant AddGroup(string group, Cluster cluster, AccessMode mode, int priority, string credentialName)
    {
        var credential = AddCredential(cluster, credentialName);
        var grant = Grant.CreateForGroup(GroupName.Create(group).Value, cluster, credential, mode, priority, [], "admin", FixedClock.Now).Value;
        _model.GrantRows.Add(grant);
        return grant;
    }

    private Credential AddCredential(Cluster cluster, string name)
    {
        var credential = Credential.Add(
            cluster,
            CredentialName.Create(name).Value,
            null,
            new EncryptedToken([9]),
            TokenFingerprint.Create("0123abcd").Value,
            TokenMetadata.Opaque,
            InspectNamespaces.Empty,
            "admin",
            FixedClock.Now);
        _model.CredentialRows.Add(credential);
        return credential;
    }

    /// <summary><see cref="IReadModel"/> over in-memory rows (LINQ to Objects).</summary>
    private sealed class InMemoryReadModel : IReadModel
    {
        public List<User> UserRows { get; } = [];

        public List<Cluster> ClusterRows { get; } = [];

        public List<Credential> CredentialRows { get; } = [];

        public List<Grant> GrantRows { get; } = [];

        public List<UserGroupCheck> CheckRows { get; } = [];

        public IQueryable<User> Users => UserRows.AsQueryable();

        public IQueryable<Cluster> Clusters => ClusterRows.AsQueryable();

        public IQueryable<Credential> Credentials => CredentialRows.AsQueryable();

        public IQueryable<Grant> Grants => GrantRows.AsQueryable();

        public IQueryable<AuditEntry> AuditEntries => Enumerable.Empty<AuditEntry>().AsQueryable();

        public IQueryable<UserGroupCheck> UserGroupChecks => CheckRows.AsQueryable();

        public Task<List<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.ToList());

        public Task<T?> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.FirstOrDefault());

        public Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Count());

        public Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Any());
    }
}
