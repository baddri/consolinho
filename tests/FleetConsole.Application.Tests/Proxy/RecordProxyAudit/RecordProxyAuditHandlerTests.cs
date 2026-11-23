using System.Text.Json;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Application.Proxy.RecordProxyAudit;
using FleetConsole.Application.Proxy.Requests;
using FleetConsole.Application.Tests.Audit;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Users;
using Microsoft.Extensions.DependencyInjection;

namespace FleetConsole.Application.Tests.Proxy.RecordProxyAudit;

/// <summary>PAUD-1/2 (ADR-0021): <see cref="RecordProxyAuditHandler"/>, <see cref="ProxyAuditActions"/> and the pipeline.</summary>
public sealed class RecordProxyAuditHandlerTests
{
    private static readonly string[] ContractKeys =
    [
        "method", "path", "group", "version", "resource", "subresource", "namespace", "name",
        "dryRun", "fieldManager", "container", "statusCode", "outcome", "reason",
    ];

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task AllowedUpdate_RecordsProxyUpdate_WithExactlyTheContractDetails()
    {
        var audit = new RecordingAuditTrail();
        // Body/header data never reaches the command; other query parameters (here a fake token) must not be recorded.
        var request = Create("PUT", "/api/v1/namespaces/shop/configmaps/web", "?dryRun=All&fieldManager=kubectl-edit&pretty=true&x=fake-token");

        var result = await Handle(audit, FakeCurrentUser.SignedIn(UserRole.User, username: "sam"),
            new ProxyAuditRecord("dev-1", request, 200, ProxyAuditOutcome.Allowed, null));

        result.IsSuccess.ShouldBeTrue();
        var record = audit.Single;
        record.Action.ShouldBe("proxy.update"); // category Proxy: derived from the prefix (domain + pipeline tests)
        record.TargetType.ShouldBe(AuditTargetType.KubernetesResource);
        record.TargetId.ShouldBeNull();
        record.TargetName.ShouldBe("shop/configmaps/web");
        record.ClusterName.ShouldBe("dev-1");
        record.Actor.ShouldBeNull(); // the audit trail fills in the current user
        record.Summary.ShouldBe("sam updated shop/configmaps/web on dev-1 (200)");

        var details = AuditDetails.Of(record).ShouldHaveExactly(ContractKeys);
        details.Str("method").ShouldBe("PUT");
        details.Str("path").ShouldBe("/api/v1/namespaces/shop/configmaps/web");
        details.Str("group").ShouldBe("");
        details.Str("version").ShouldBe("v1");
        details.Str("resource").ShouldBe("configmaps");
        details.IsNull("subresource").ShouldBeTrue();
        details.Str("namespace").ShouldBe("shop");
        details.Str("name").ShouldBe("web");
        details.Str("dryRun").ShouldBe("All");
        details.Str("fieldManager").ShouldBe("kubectl-edit");
        details.IsNull("container").ShouldBeTrue();
        details.GetProperty("statusCode").GetInt32().ShouldBe(200);
        details.Str("outcome").ShouldBe("allowed");
        details.IsNull("reason").ShouldBeTrue();
        details.GetRawText().ShouldNotContain("fake-token");
        details.GetRawText().ShouldNotContain("pretty");
    }

    [Fact]
    public async Task DeniedByReadOnlyGrant_RecordsDeniedOutcomeAndReason()
    {
        var audit = new RecordingAuditTrail();
        var request = Create("DELETE", "/api/v1/namespaces/shop/pods/web-1");

        await Handle(audit, FakeCurrentUser.SignedIn(UserRole.User),
            new ProxyAuditRecord("dev-1", request, 403, ProxyAuditOutcome.Denied, ProxyDenialReason.ReadOnlyGrant));

        var record = audit.Single;
        record.Action.ShouldBe("proxy.delete");
        record.Summary.ShouldBe("Denied: alice tried to delete shop/pods/web-1 on dev-1 (read-only grant)");
        var details = AuditDetails.Of(record).ShouldHaveExactly(ContractKeys);
        details.Str("outcome").ShouldBe("denied");
        details.Str("reason").ShouldBe("readOnlyGrant");
        details.GetProperty("statusCode").GetInt32().ShouldBe(403);
        details.IsNull("dryRun").ShouldBeTrue();
        details.IsNull("fieldManager").ShouldBeTrue();
    }

    [Fact]
    public async Task Exec_RecordsTheContainer_AndNeverTheCommand()
    {
        var audit = new RecordingAuditTrail();
        var request = Create("GET", "/api/v1/namespaces/shop/pods/web-1/exec",
            "?command=sh&command=-c&command=echo%20fake-secret&container=app&stdin=1&tty=1", isUpgrade: true);

        await Handle(audit, FakeCurrentUser.SignedIn(UserRole.User, username: "sam"),
            new ProxyAuditRecord("dev-1", request, 101, ProxyAuditOutcome.Allowed, null));

        var record = audit.Single;
        record.Action.ShouldBe("proxy.connect");
        var details = AuditDetails.Of(record).ShouldHaveExactly(ContractKeys);
        details.Str("subresource").ShouldBe("exec");
        details.Str("container").ShouldBe("app");
        details.GetProperty("statusCode").GetInt32().ShouldBe(101);
        details.GetRawText().ShouldNotContain("fake-secret");
        details.GetRawText().ShouldNotContain("command");
        record.Summary.ShouldNotContain("fake-secret");
    }

    [Fact]
    public async Task NoAccess_WithoutClusterName_LeavesClusterOut()
    {
        var audit = new RecordingAuditTrail();
        var request = Create("POST", "/api/v1/namespaces/shop/pods");

        var result = await Handle(audit, FakeCurrentUser.SignedIn(UserRole.User),
            new ProxyAuditRecord(null, request, 404, ProxyAuditOutcome.Denied, ProxyDenialReason.NoAccess));

        result.IsSuccess.ShouldBeTrue();
        var record = audit.Single;
        record.ClusterName.ShouldBeNull();
        record.TargetName.ShouldBe("shop/pods");
        record.Summary.ShouldBe("Denied: alice tried to create shop/pods (no access)");
        AuditDetails.Of(record).Str("reason").ShouldBe("noAccess");
    }

    [Fact]
    public async Task NonResourceRequest_UsesThePath_AndNullGroup()
    {
        var audit = new RecordingAuditTrail();
        var request = Create("POST", "/version");

        await Handle(audit, FakeCurrentUser.SignedIn(UserRole.User),
            new ProxyAuditRecord("dev-1", request, 405, ProxyAuditOutcome.Allowed, null));

        var record = audit.Single;
        record.TargetName.ShouldBe("/version");
        var details = AuditDetails.Of(record).ShouldHaveExactly(ContractKeys);
        details.IsNull("group").ShouldBeTrue();
        details.IsNull("resource").ShouldBeTrue();
    }

    [Theory]
    [InlineData(ProxyAuditOutcome.Allowed, ProxyDenialReason.UserReadOnly)]
    [InlineData(ProxyAuditOutcome.Denied, null)]
    public async Task InconsistentOutcomeAndReason_Throws(ProxyAuditOutcome outcome, ProxyDenialReason? reason)
    {
        var record = new ProxyAuditRecord("dev-1", Create("PUT", "/api/v1/namespaces/shop/configmaps/web"), 200, outcome, reason);

        await Should.ThrowAsync<ArgumentException>(() => Handle(new RecordingAuditTrail(), FakeCurrentUser.SignedIn(UserRole.User), record));
    }

    [Theory]
    [InlineData("GET", "/api/v1/namespaces/shop/pods/web-1", "")]
    [InlineData("GET", "/api/v1/namespaces/shop/pods", "")]
    [InlineData("GET", "/api/v1/namespaces/shop/pods", "?watch=true")]
    public async Task Reads_Throw(string method, string path, string query)
    {
        var record = new ProxyAuditRecord("dev-1", Create(method, path, query), 200, ProxyAuditOutcome.Allowed, null);

        await Should.ThrowAsync<ArgumentException>(() => Handle(new RecordingAuditTrail(), FakeCurrentUser.SignedIn(UserRole.User), record));
    }

    [Theory]
    [InlineData(KubernetesVerb.Create, "proxy.create")]
    [InlineData(KubernetesVerb.Update, "proxy.update")]
    [InlineData(KubernetesVerb.Patch, "proxy.patch")]
    [InlineData(KubernetesVerb.Delete, "proxy.delete")]
    [InlineData(KubernetesVerb.DeleteCollection, "proxy.delete_collection")]
    [InlineData(KubernetesVerb.Connect, "proxy.connect")]
    [InlineData(KubernetesVerb.Other, "proxy.other")]
    public void Actions_MapEveryMutatingVerb(KubernetesVerb verb, string action)
    {
        ProxyAuditActions.For(verb).ShouldBe(action);
        action.ShouldStartWith(ProxyAuditActions.Prefix);
    }

    [Theory]
    [InlineData(KubernetesVerb.Get)]
    [InlineData(KubernetesVerb.List)]
    [InlineData(KubernetesVerb.Watch)]
    public void Actions_ReadVerbs_Throw(KubernetesVerb verb) =>
        Should.Throw<ArgumentException>(() => ProxyAuditActions.For(verb));

    [Fact]
    public void Command_IsNotMutating_ButRequiresAuthentication()
    {
        typeof(IMutatingCommand).IsAssignableFrom(typeof(RecordProxyAuditCommand)).ShouldBeFalse();
        typeof(IRequireAuthenticated).IsAssignableFrom(typeof(RecordProxyAuditCommand)).ShouldBeTrue();
    }

    [Fact]
    public async Task ThroughThePipeline_ReadOnlyUsersDenial_IsSaved_WithTheUserAsActor()
    {
        // ReadOnlyGuardBehavior must not swallow the denial of a read-only user (PAUD-2): the real pipeline and the real
        // AuditTrail stage the entry and UnitOfWorkBehavior saves it.
        var unitOfWork = new Behaviors.FakeUnitOfWork();
        var currentUser = FakeCurrentUser.SignedIn(UserRole.User, isReadOnly: true, username: "ines");
        await using var provider = ServiceProviderBuilder.Build(
            services => services.AddScoped<ICurrentUser>(_ => currentUser), unitOfWork: unitOfWork);
        await using var scope = provider.CreateAsyncScope();
        var record = new ProxyAuditRecord(
            "dev-1", Create("PATCH", "/apis/apps/v1/namespaces/shop/deployments/web/scale"), 403,
            ProxyAuditOutcome.Denied, ProxyDenialReason.UserReadOnly);

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new RecordProxyAuditCommand(record), Ct);

        result.IsSuccess.ShouldBeTrue();
        unitOfWork.SaveCount.ShouldBe(1);
        var entry = ((CapturingAuditEntryRepository)scope.ServiceProvider.GetRequiredService<IAuditEntryRepository>())
            .Entries.ShouldHaveSingleItem();
        entry.Action.ShouldBe("proxy.patch");
        entry.Category.ShouldBe(AuditCategory.Proxy);
        entry.TargetType.ShouldBe(AuditTargetType.KubernetesResource);
        entry.TargetName.ShouldBe("shop/deployments.apps/web/scale");
        entry.Actor.Name.ShouldBe("ines");
        entry.Actor.UserId.ShouldBe(currentUser.UserId);
        using var details = JsonDocument.Parse(entry.DetailsJson);
        details.RootElement.GetProperty("reason").GetString().ShouldBe("userReadOnly");
        details.RootElement.GetProperty("subresource").GetString().ShouldBe("scale");
        details.RootElement.GetProperty("group").GetString().ShouldBe("apps");
    }

    [Fact]
    public async Task ThroughThePipeline_Anonymous_IsUnauthenticated()
    {
        await using var provider = ServiceProviderBuilder.Build(unitOfWork: new Behaviors.FakeUnitOfWork());
        await using var scope = provider.CreateAsyncScope();
        var record = new ProxyAuditRecord("dev-1", Create("PUT", "/api/v1/namespaces/shop/configmaps/web"), 200, ProxyAuditOutcome.Allowed, null);

        var result = await scope.ServiceProvider.GetRequiredService<IDispatcher>().Send(new RecordProxyAuditCommand(record), Ct);

        result.Error.ShouldBe(AuthErrors.Unauthenticated);
    }

    private static Task<Domain.Common.Result> Handle(RecordingAuditTrail audit, ICurrentUser currentUser, ProxyAuditRecord record) =>
        new RecordProxyAuditHandler(audit, currentUser).Handle(new RecordProxyAuditCommand(record), Ct);

    private static ProxyRequest Create(string method, string path, string query = "", bool isUpgrade = false)
    {
        ProxyPath.TryParse(path, out var proxyPath).ShouldBeTrue();
        return ProxyRequest.Create(method, proxyPath, query, isUpgrade, contentLength: null);
    }
}
