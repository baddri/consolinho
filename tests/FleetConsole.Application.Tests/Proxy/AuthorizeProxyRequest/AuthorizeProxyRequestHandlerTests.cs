using FleetConsole.Application.Tests.Access;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Access;
using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.AuthorizeProxyRequest;
using FleetConsole.Application.Proxy.Policies;
using FleetConsole.Application.Proxy.Requests;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Application.Tests.Auth;
using FleetConsole.Application.Tests.Clusters;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using static FleetConsole.Application.Tests.Proxy.ProxyTestRequests;

namespace FleetConsole.Application.Tests.Proxy.AuthorizeProxyRequest;

/// <summary>
/// PRX-2 (every "no access" case is the same <c>Proxy.NotAvailable</c>), the decrypted target on success, the stricter
/// read-only rule, and policy ordering of <see cref="AuthorizeProxyRequestHandler"/>.
/// </summary>
public sealed class AuthorizeProxyRequestHandlerTests
{
    private const string Expected404 = "Cluster prod-east is not available — it does not exist or you don't have access.";

    private readonly ProxyReadModel _model = new();
    private readonly ITokenProtector _protector = Substitute.For<ITokenProtector>();
    private readonly User _alice = AuthTestUsers.PreCreated("alice");
    private readonly Cluster _cluster = TestClusters.Create("prod-east");

    public AuthorizeProxyRequestHandlerTests()
    {
        _protector.Unprotect(Arg.Any<EncryptedToken>()).Returns(new SensitiveString("fake-sa-token"));
        _model.UserRows.Add(_alice);
        _model.ClusterRows.Add(_cluster);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Valid_grant_returns_the_cluster_connection_and_decrypted_token()
    {
        var credential = AddGrant(_alice, _cluster, AccessMode.ReadWrite);

        var result = await Handle("prod-east");

        result.IsSuccess.ShouldBeTrue();
        result.Value.ClusterId.ShouldBe(_cluster.Id);
        result.Value.ClusterName.ShouldBe("prod-east");
        result.Value.Connection.ShouldBe(new ClusterConnection(_cluster.Endpoint.Url, null, false));
        result.Value.Token.Reveal().ShouldBe("fake-sa-token");
        _protector.Received(1).Unprotect(credential.Token);
    }

    [Fact]
    public async Task Unknown_cluster_is_not_available()
    {
        AddGrant(_alice, _cluster, AccessMode.ReadWrite);

        var result = await Handle("prod-west");

        result.Error!.Code.ShouldBe(ProxyErrors.NotAvailableCode);
        result.Error.Message.ShouldBe("Cluster prod-west is not available — it does not exist or you don't have access.");
    }

    [Fact]
    public async Task Disabled_cluster_is_not_available()
    {
        var disabled = TestClusters.Create("prod-east", isEnabled: false);
        _model.ClusterRows.Clear();
        _model.ClusterRows.Add(disabled);
        AddGrant(_alice, disabled, AccessMode.ReadWrite);

        await ShouldBeNotAvailable();
    }

    [Fact]
    public async Task No_grant_is_not_available()
    {
        var bob = AuthTestUsers.PreCreated("bob");
        _model.UserRows.Add(bob);
        AddGrant(bob, _cluster, AccessMode.ReadWrite);

        await ShouldBeNotAvailable();
    }

    [Fact]
    public async Task Deactivated_user_is_not_available()
    {
        var deactivated = AuthTestUsers.Deactivated("alice");
        _model.UserRows.Clear();
        _model.UserRows.Add(deactivated);
        AddGrant(deactivated, _cluster, AccessMode.ReadWrite);

        await ShouldBeNotAvailable(deactivated.Id);
    }

    [Fact]
    public async Task Missing_credential_is_not_available()
    {
        var credential = AddGrant(_alice, _cluster, AccessMode.ReadWrite);
        _model.CredentialRows.Remove(credential);

        await ShouldBeNotAvailable();
    }

    [Theory]
    [InlineData("Prod-East")]
    [InlineData("../admin")]
    [InlineData("")]
    public async Task Malformed_name_is_not_available_without_echoing_it(string name)
    {
        AddGrant(_alice, _cluster, AccessMode.ReadWrite);

        var result = await Handle(name);

        result.Error.ShouldBe(ProxyErrors.NotAvailableUnnamed);
        result.Error!.Code.ShouldBe(ProxyErrors.NotAvailableCode);
        result.Error.Type.ShouldBe(ErrorType.NotFound);
    }

    [Theory]
    [InlineData(true, false)]  // stored user read-only, session not (yet)
    [InlineData(false, true)]  // session read-only, stored not
    public async Task Either_read_only_flag_makes_the_user_read_only(bool stored, bool session)
    {
        var user = AuthTestUsers.PreCreated("carol", isReadOnly: stored);
        _model.UserRows.Add(user);
        AddGrant(user, _cluster, AccessMode.ReadWrite);

        var result = await Handle("prod-east", Request("DELETE", Pod), userId: user.Id, sessionReadOnly: session);

        result.Error.ShouldBe(ProxyErrors.UserReadOnly);
    }

    [Fact]
    public async Task Read_only_grant_refuses_mutations_but_allows_reads()
    {
        AddGrant(_alice, _cluster, AccessMode.ReadOnly);

        (await Handle("prod-east", Request("GET", Pod))).IsSuccess.ShouldBeTrue();
        (await Handle("prod-east", Request("PUT", Pod))).Error!.Message.ShouldBe("Your access to prod-east is read-only.");
    }

    [Fact]
    public async Task Policies_run_in_registration_order_and_the_first_refusal_wins()
    {
        AddGrant(_alice, _cluster, AccessMode.ReadWrite);
        var calls = new List<string>();
        var refusal = Error.Forbidden("Test.First", "first");
        IProxyPolicy[] policies =
        [
            new RecordingPolicy("first", calls, refusal),
            new RecordingPolicy("second", calls, Error.Forbidden("Test.Second", "second")),
        ];

        var result = await Handle("prod-east", policies: policies);

        result.Error.ShouldBe(refusal);
        calls.ShouldBe(["first"]);
        _protector.DidNotReceive().Unprotect(Arg.Any<EncryptedToken>());
    }

    [Fact]
    public async Task All_passing_policies_run_in_order_and_receive_the_context()
    {
        AddGrant(_alice, _cluster, AccessMode.ReadOnly);
        var calls = new List<string>();
        var first = new RecordingPolicy("first", calls, null);
        var second = new RecordingPolicy("second", calls, null);

        var result = await Handle("prod-east", policies: [first, second]);

        result.IsSuccess.ShouldBeTrue();
        calls.ShouldBe(["first", "second"]);
        first.Context.ShouldNotBeNull();
        first.Context.UserId.ShouldBe(_alice.Id);
        first.Context.Username.ShouldBe("alice");
        first.Context.ClusterName.ShouldBe("prod-east");
        first.Context.Environment.ShouldBe(ClusterEnvironment.Production);
        first.Context.GrantMode.ShouldBe(AccessMode.ReadOnly);
        first.Context.UserIsReadOnly.ShouldBeFalse();
    }

    [Fact]
    public void AddApplication_registers_the_mutation_guard_before_the_body_limit()
    {
        using var provider = ServiceProviderBuilder.Build();
        using var scope = provider.CreateScope();

        var types = scope.ServiceProvider.GetServices<IProxyPolicy>().Select(p => p.GetType()).ToList();

        types.ShouldBe([typeof(MutationGuardPolicy), typeof(RequestBodyLimitPolicy)]);
    }

    [Fact]
    public async Task Registered_chain_returns_user_read_only_before_body_too_large()
    {
        var user = AuthTestUsers.PreCreated("dave", isReadOnly: true);
        _model.UserRows.Add(user);
        AddGrant(user, _cluster, AccessMode.ReadOnly);
        IProxyPolicy[] chain = [new MutationGuardPolicy(), new RequestBodyLimitPolicy(Options.Create(new ProxyOptions()))];

        var result = await Handle("prod-east", Request("PUT", Pod, long.MaxValue), user.Id, policies: chain);

        result.Error.ShouldBe(ProxyErrors.UserReadOnly);
    }

    // --- Group grants (CP4.5 PREC-2..7) through ClusterAccessReader + AccessResolver ---

    [Fact]
    public async Task Group_member_gets_the_group_grant_and_its_token()
    {
        _alice.ReplaceGroups(["sre-emea"]);
        var credential = AddGroupGrant("sre-emea", AccessMode.ReadWrite, priority: 10);

        var result = await Handle("prod-east", Request("DELETE", Pod));

        result.IsSuccess.ShouldBeTrue();
        _protector.Received(1).Unprotect(credential.Token);
    }

    [Fact]
    public async Task Group_grant_of_another_group_is_not_available()
    {
        _alice.ReplaceGroups(["sre-apac"]);
        AddGroupGrant("sre-emea", AccessMode.ReadWrite, priority: 10);

        await ShouldBeNotAvailable();
    }

    [Fact]
    public async Task Deactivated_group_member_is_not_available()
    {
        var deactivated = AuthTestUsers.Deactivated("alice");
        deactivated.ReplaceGroups(["sre-emea"]);
        _model.UserRows.Clear();
        _model.UserRows.Add(deactivated);
        AddGroupGrant("sre-emea", AccessMode.ReadWrite, priority: 10);

        await ShouldBeNotAvailable(deactivated.Id);
    }

    [Fact]
    public async Task Direct_read_only_grant_beats_a_read_write_group_grant()
    {
        _alice.ReplaceGroups(["sre-emea"]);
        var direct = AddGrant(_alice, _cluster, AccessMode.ReadOnly);
        AddGroupGrant("sre-emea", AccessMode.ReadWrite, priority: 1000);

        (await Handle("prod-east", Request("PUT", Pod))).Error!.Message.ShouldBe("Your access to prod-east is read-only.");
        (await Handle("prod-east", Request("GET", Pod))).IsSuccess.ShouldBeTrue();
        _protector.Received(1).Unprotect(direct.Token);
    }

    [Fact]
    public async Task Highest_priority_group_grant_supplies_mode_and_credential_and_only_its_token_is_decrypted()
    {
        _alice.ReplaceGroups(["sre-emea", "platform"]);
        var low = AddGroupGrant("sre-emea", AccessMode.ReadOnly, priority: 10);
        var high = AddGroupGrant("platform", AccessMode.ReadWrite, priority: 20);

        var result = await Handle("prod-east", Request("DELETE", Pod));

        result.IsSuccess.ShouldBeTrue();
        _protector.Received(1).Unprotect(high.Token);
        _protector.DidNotReceive().Unprotect(low.Token);
    }

    [Fact]
    public async Task Read_only_user_flag_narrows_a_read_write_group_grant()
    {
        var user = AuthTestUsers.PreCreated("carol", isReadOnly: true);
        user.ReplaceGroups(["sre-emea"]);
        _model.UserRows.Add(user);
        AddGroupGrant("sre-emea", AccessMode.ReadWrite, priority: 10);

        var result = await Handle("prod-east", Request("DELETE", Pod), userId: user.Id);

        result.Error.ShouldBe(ProxyErrors.UserReadOnly);
    }

    [Fact]
    public async Task Tied_group_grants_resolve_to_read_only_and_log_a_warning_with_ids_only()
    {
        // The database refuses two group grants with one priority on a cluster; the reader must still cope (PREC-5).
        _alice.ReplaceGroups(["sre-emea", "platform"]);
        AddGroupGrant("sre-emea", AccessMode.ReadWrite, priority: 10);
        var readOnly = AddGroupGrant("platform", AccessMode.ReadOnly, priority: 10);
        var logger = new TieLogger();
        var reader = TestAccessReader.Create(_model, logger);

        var access = await reader.LoadAsync(_alice.Id, _cluster.Name, sessionIsReadOnly: false, Ct);

        access.ShouldHaveSingleItem().WinnerToken.ShouldBe(readOnly.Token);
        access[0].Resolution.EffectiveMode.ShouldBe(AccessMode.ReadOnly);
        var warning = logger.Messages.ShouldHaveSingleItem();
        warning.ShouldContain(_cluster.Id.Value.ToString());
        warning.ShouldNotContain("sre-emea");
        warning.ShouldNotContain("alice");
    }

    private async Task ShouldBeNotAvailable(UserId? userId = null)
    {
        var result = await Handle("prod-east", userId: userId);

        result.Error!.Code.ShouldBe(ProxyErrors.NotAvailableCode);
        result.Error.Type.ShouldBe(ErrorType.NotFound);
        result.Error.Message.ShouldBe(Expected404);
        _protector.DidNotReceive().Unprotect(Arg.Any<EncryptedToken>());
    }

    private Task<Result<ProxyTarget>> Handle(
        string clusterName,
        ProxyRequest? request = null,
        UserId? userId = null,
        bool sessionReadOnly = false,
        IEnumerable<IProxyPolicy>? policies = null)
    {
        var currentUser = new SignedInAs(userId ?? _alice.Id, "alice", UserRole.User, sessionReadOnly);
        var chain = policies ?? [new MutationGuardPolicy(), new RequestBodyLimitPolicy(Options.Create(new ProxyOptions()))];
        var handler = new AuthorizeProxyRequestHandler(TestAccessReader.Create(_model), currentUser, _protector, chain);
        return handler.Handle(new AuthorizeProxyRequestQuery(clusterName, request ?? Request("GET", Pods)), Ct);
    }

    private Credential AddGrant(User user, Cluster cluster, AccessMode mode)
    {
        var credential = Credential.Add(
            cluster,
            CredentialName.Create("sa-" + user.Username.Value).Value,
            null,
            new EncryptedToken([9]),
            TokenFingerprint.Create("0123abcd").Value,
            TokenMetadata.Opaque,
            InspectNamespaces.Empty,
            "admin",
            FixedClock.Now);
        var grant = Grant.Create(user, cluster, credential, mode, new HashSet<ClusterId>(), "admin", FixedClock.Now).Value;
        _model.CredentialRows.Add(credential);
        _model.GrantRows.Add(grant);
        return credential;
    }

    private int _groupCredentials;

    /// <summary>Adds a grant to <paramref name="group"/> on prod-east with its own credential (distinct token bytes).</summary>
    private Credential AddGroupGrant(string group, AccessMode mode, int priority)
    {
        var number = ++_groupCredentials;
        var credential = Credential.Add(
            _cluster,
            CredentialName.Create($"sa-group-{number}").Value,
            null,
            new EncryptedToken([(byte)(100 + number)]),
            TokenFingerprint.Create("0123abcd").Value,
            TokenMetadata.Opaque,
            InspectNamespaces.Empty,
            "admin",
            FixedClock.Now);
        var grant = Grant.CreateForGroup(GroupName.Create(group).Value, _cluster, credential, mode, priority, [], "admin", FixedClock.Now).Value;
        _model.CredentialRows.Add(credential);
        _model.GrantRows.Add(grant);
        return credential;
    }

    /// <summary>Records warnings written by <see cref="ClusterAccessReader"/>.</summary>
    private sealed class TieLogger : ILogger<ClusterAccessReader>
    {
        public List<string> Messages { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (logLevel == LogLevel.Warning)
            {
                Messages.Add(formatter(state, exception));
            }
        }
    }

    /// <summary>A policy that records that it ran (and with what) and returns a fixed decision.</summary>
    private sealed class RecordingPolicy(string name, List<string> calls, Error? refusal) : IProxyPolicy
    {
        public ProxyRequestContext? Context { get; private set; }

        public ValueTask<Result> EvaluateAsync(ProxyRequestContext context, CancellationToken ct)
        {
            calls.Add(name);
            Context = context;
            return ValueTask.FromResult(refusal is null ? Result.Success() : Result.Failure(refusal));
        }
    }

    /// <summary><see cref="IReadModel"/> over in-memory users, clusters, credentials and grants (LINQ to Objects).</summary>
    private sealed class ProxyReadModel : IReadModel
    {
        public List<User> UserRows { get; } = [];

        public List<Cluster> ClusterRows { get; } = [];

        public List<Credential> CredentialRows { get; } = [];

        public List<Grant> GrantRows { get; } = [];

        public IQueryable<User> Users => UserRows.AsQueryable();

        public IQueryable<Cluster> Clusters => ClusterRows.AsQueryable();

        public IQueryable<Credential> Credentials => CredentialRows.AsQueryable();

        public IQueryable<Grant> Grants => GrantRows.AsQueryable();

        public IQueryable<AuditEntry> AuditEntries => Enumerable.Empty<AuditEntry>().AsQueryable();


        public IQueryable<UserGroupCheck> UserGroupChecks => Enumerable.Empty<UserGroupCheck>().AsQueryable();

        public Task<List<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.ToList());

        public Task<T?> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.FirstOrDefault());

        public Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Count());

        public Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken) => Task.FromResult(query.Any());
    }
}
