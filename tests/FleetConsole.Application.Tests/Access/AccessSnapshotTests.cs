using System.Text.Json;
using FleetConsole.Application.Abstractions.Caching;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Access;
using FleetConsole.Application.Access.LoadAccessSnapshot;
using FleetConsole.Application.Tests.Auth;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.Logging.Abstractions;

namespace FleetConsole.Application.Tests.Access;

/// <summary>
/// CACHE-1: the access snapshot — its key and tags, its JSON round-trip (the shape the Redis L2 stores), what the
/// handler loads (disabled clusters kept, deactivated users empty), and that the reader applies the enabled filter and
/// the session read-only flag per request on the same snapshot.
/// </summary>
public sealed class AccessSnapshotTests
{
    private static readonly UserId Alice = new(Guid.Parse("0f0e0d0c-0000-0000-0000-000000000001"));

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public void Key_is_versioned_per_user()
    {
        new LoadAccessSnapshotQuery(Alice).CacheKey.ShouldBe("access:v2:user:0f0e0d0c-0000-0000-0000-000000000001");
    }

    [Fact]
    public void Tags_are_the_user_every_rows_cluster_and_credential_and_every_group()
    {
        var snapshot = Snapshot(groups: ["sre-emea", "platform"], Row(), Row(clusterId: Row().ClusterId, credentialId: Guid.NewGuid()));

        var tags = new LoadAccessSnapshotQuery(Alice).TagsFor(snapshot);

        var expected = new List<string>
        {
            CacheTags.User(Alice),
            CacheTags.Cluster(new ClusterId(snapshot.Rows[0].ClusterId)),
            CacheTags.Credential(new CredentialId(snapshot.Rows[0].CredentialId)),
            CacheTags.Credential(new CredentialId(snapshot.Rows[1].CredentialId)),
            CacheTags.Group("sre-emea"),
            CacheTags.Group("platform"),
        };
        tags.ShouldBe(expected, ignoreOrder: true);
        // FusionCache logs removed tags inside internal keys; group names must never reach a log (SECURITY.md).
        tags.ShouldAllBe(t => !t.Contains("sre-emea") && !t.Contains("platform"));
    }

    [Fact]
    public void Tags_of_a_user_without_grants_still_include_their_groups()
    {
        var tags = new LoadAccessSnapshotQuery(Alice).TagsFor(Snapshot(groups: ["sre-emea"]));

        tags.ShouldBe([CacheTags.User(Alice), CacheTags.Group("sre-emea")], ignoreOrder: true);
    }

    [Fact]
    public void Snapshot_survives_a_System_Text_Json_round_trip()
    {
        var snapshot = Snapshot(groups: ["sre-emea"], Row(), Row(groupName: "sre-emea", priority: 10, caBundlePem: "-----BEGIN CERTIFICATE-----", inspectNamespaces: ["team-a", "team-b"]));

        var json = JsonSerializer.Serialize(snapshot);
        var back = JsonSerializer.Deserialize<AccessSnapshot>(json)!;

        // Records compare collections by reference, so compare the parts.
        (back with { UserGroups = snapshot.UserGroups, Rows = snapshot.Rows }).ShouldBe(snapshot);
        back.UserGroups.ShouldBe(snapshot.UserGroups);
        back.Rows.Count.ShouldBe(2);
        for (var i = 0; i < back.Rows.Count; i++)
        {
            back.Rows[i].EncryptedToken.ShouldBe(snapshot.Rows[i].EncryptedToken);
            back.Rows[i].InspectNamespaces.ShouldBe(snapshot.Rows[i].InspectNamespaces);
            (back.Rows[i] with { EncryptedToken = snapshot.Rows[i].EncryptedToken, InspectNamespaces = snapshot.Rows[i].InspectNamespaces })
                .ShouldBe(snapshot.Rows[i]);
        }
    }

    [Fact]
    public async Task Handler_keeps_rows_of_disabled_clusters_and_the_reader_filters_them()
    {
        var model = new AccessReadModel();
        var user = model.AddUser("alice");
        var enabled = model.AddCluster("prod-east");
        var disabled = model.AddCluster("prod-west", isEnabled: false);
        model.AddGrant(user, enabled, AccessMode.ReadWrite);
        model.AddGrant(user, disabled, AccessMode.ReadWrite);

        var snapshot = (await new LoadAccessSnapshotHandler(model).Handle(new LoadAccessSnapshotQuery(user.Id), Ct)).Value;
        var access = await TestAccessReader.Create(model).LoadAsync(user.Id, null, sessionIsReadOnly: false, Ct);

        snapshot.Rows.Select(r => r.ClusterName).ShouldBe(["prod-east", "prod-west"], ignoreOrder: true);
        snapshot.Rows.Single(r => r.ClusterName == "prod-west").ClusterIsEnabled.ShouldBeFalse();
        access.ShouldHaveSingleItem().ClusterName.Value.ShouldBe("prod-east");
        (await TestAccessReader.Create(model).LoadAsync(user.Id, disabled.Name, false, Ct)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Handler_returns_not_found_for_a_deactivated_user()
    {
        var model = new AccessReadModel();
        var user = AuthTestUsers.Deactivated("alice");
        model.UserRows.Add(user);
        model.AddGrant(user, model.AddCluster("prod-east"), AccessMode.ReadWrite);

        var snapshot = (await new LoadAccessSnapshotHandler(model).Handle(new LoadAccessSnapshotQuery(user.Id), Ct)).Value;

        snapshot.ShouldBe(AccessSnapshot.NotFound);
    }

    [Fact]
    public async Task Reader_applies_the_session_read_only_flag_per_request_on_one_snapshot()
    {
        var snapshot = Snapshot(groups: [], Row(accessMode: nameof(AccessMode.ReadWrite)));
        var dispatcher = new FixedSnapshotDispatcher(snapshot);
        var reader = new ClusterAccessReader(dispatcher, NullLogger<ClusterAccessReader>.Instance);

        var writable = await reader.LoadAsync(Alice, null, sessionIsReadOnly: false, Ct);
        var readOnly = await reader.LoadAsync(Alice, null, sessionIsReadOnly: true, Ct);

        writable.ShouldHaveSingleItem().Resolution.EffectiveMode.ShouldBe(AccessMode.ReadWrite);
        readOnly.ShouldHaveSingleItem().Resolution.EffectiveMode.ShouldBe(AccessMode.ReadOnly);
        dispatcher.Queries.ShouldBe([new LoadAccessSnapshotQuery(Alice), new LoadAccessSnapshotQuery(Alice)]);
    }

    [Fact]
    public async Task Reader_maps_the_row_back_to_value_objects()
    {
        var row = Row(caBundlePem: "pem", skipTlsVerify: true) with { WebConsoleUrl = "https://console.example.com" };
        var reader = new ClusterAccessReader(new FixedSnapshotDispatcher(Snapshot(groups: [], row)), NullLogger<ClusterAccessReader>.Instance);

        var access = (await reader.LoadAsync(Alice, ClusterName.Create(row.ClusterName).Value, false, Ct)).ShouldHaveSingleItem();

        access.ClusterId.Value.ShouldBe(row.ClusterId);
        access.Environment.ShouldBe(ClusterEnvironment.Staging);
        access.Distribution.ShouldBe(ClusterDistribution.Kubernetes);
        access.Connection.ApiUrl.ShouldBe(new Uri(row.ApiUrl));
        access.Connection.CaBundlePem.ShouldBe("pem");
        access.Connection.SkipTlsVerify.ShouldBeTrue();
        access.WebConsoleUrl.ShouldBe("https://console.example.com");
        access.Username.ShouldBe("alice");
        access.WinnerToken.ShouldBe(new EncryptedToken(row.EncryptedToken));
        access.WinnerCredentialName.ShouldBe(row.CredentialName);
        access.CandidateCredentialNames.ShouldBe(new Dictionary<GrantId, string> { [new GrantId(row.GrantId)] = row.CredentialName });
        access.WinnerInspectNamespaces.ShouldBeEmpty();
    }

    [Fact]
    public async Task Reader_takes_the_inspect_namespaces_of_the_winning_grants_credential_only()
    {
        // The group grant (listed first) loses to the direct grant (PREC-2), so its credential's namespaces must not leak.
        var groupRow = Row(groupName: "sre-emea", priority: 10, credentialName: "sa-group", inspectNamespaces: ["group-ns"]);
        var directRow = Row(credentialName: "sa-direct", inspectNamespaces: ["team-b", "team-a"]);
        var reader = new ClusterAccessReader(
            new FixedSnapshotDispatcher(Snapshot(groups: ["sre-emea"], groupRow, directRow)), NullLogger<ClusterAccessReader>.Instance);

        var access = (await reader.LoadAsync(Alice, null, false, Ct)).ShouldHaveSingleItem();

        access.WinnerCredentialName.ShouldBe("sa-direct");
        access.WinnerInspectNamespaces.ShouldBe(["team-b", "team-a"]);
    }

    [Fact]
    public async Task Handler_projects_the_credentials_inspect_namespaces_in_saved_order()
    {
        var model = new AccessReadModel();
        var user = model.AddUser("alice");
        model.AddGrant(user, model.AddCluster("prod-east"), AccessMode.ReadWrite, ["team-b", "team-a"]);
        model.AddGrant(user, model.AddCluster("prod-west"), AccessMode.ReadWrite);

        var snapshot = (await new LoadAccessSnapshotHandler(model).Handle(new LoadAccessSnapshotQuery(user.Id), Ct)).Value;

        snapshot.Rows.Single(r => r.ClusterName == "prod-east").InspectNamespaces.ShouldBe(["team-b", "team-a"]);
        snapshot.Rows.Single(r => r.ClusterName == "prod-west").InspectNamespaces.ShouldBeEmpty();
    }

    private static AccessSnapshot Snapshot(IReadOnlyList<string> groups, params AccessSnapshotRow[] rows) =>
        new(true, "alice", false, groups, rows);

    private static readonly Guid ClusterGuid = Guid.NewGuid();

    private static AccessSnapshotRow Row(
        Guid? clusterId = null,
        Guid? credentialId = null,
        string? groupName = null,
        int? priority = null,
        string accessMode = nameof(AccessMode.ReadOnly),
        string? caBundlePem = null,
        bool skipTlsVerify = false,
        string credentialName = "sa-viewer",
        IReadOnlyList<string>? inspectNamespaces = null) =>
        new(
            clusterId ?? ClusterGuid,
            "prod-east",
            "Prod East",
            ClusterIsEnabled: true,
            nameof(ClusterEnvironment.Staging),
            nameof(ClusterDistribution.Kubernetes),
            "https://api.prod-east.example.com:6443",
            caBundlePem,
            skipTlsVerify,
            WebConsoleUrl: null,
            Guid.NewGuid(),
            groupName,
            priority,
            accessMode,
            credentialId ?? Guid.NewGuid(),
            credentialName,
            [1, 2, 3],
            inspectNamespaces ?? []);

    /// <summary>Returns one snapshot for every query and records the queries (a cache that always hits).</summary>
    private sealed class FixedSnapshotDispatcher(AccessSnapshot snapshot) : IDispatcher
    {
        public List<LoadAccessSnapshotQuery> Queries { get; } = [];

        public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken)
        {
            Queries.Add((LoadAccessSnapshotQuery)(object)request);
            return Task.FromResult((TResponse)(object)Result.Success(snapshot));
        }
    }
}
