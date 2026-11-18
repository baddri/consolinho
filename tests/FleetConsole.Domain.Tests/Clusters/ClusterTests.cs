using System.Reflection;
using System.Runtime.CompilerServices;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Clusters.Events;
using FleetConsole.Domain.Common;
using static FleetConsole.Domain.Tests.DomainTestData;

namespace FleetConsole.Domain.Tests.Clusters;

public sealed class ClusterTests
{
    private static readonly DateTimeOffset Later = Now.AddHours(2);
    private static readonly Uri ConsoleUrl = new("https://console.prod-eu-1.example.com");

    // ---- register (CLU-1) -------------------------------------------------------------------------------------------

    [Fact]
    public void Register_SetsState_AndRaisesClusterRegistered()
    {
        var endpoint = Endpoint(caBundlePem: CertificatePem());

        var cluster = Cluster.Register(
            NameOf("prod-eu-1"), "Prod EU 1", endpoint, ClusterEnvironment.Staging, ConsoleUrl, "Main cluster",
            isEnabled: false, "admin", Now);

        cluster.Id.Value.ShouldNotBe(Guid.Empty);
        cluster.Name.Value.ShouldBe("prod-eu-1");
        cluster.DisplayName.ShouldBe("Prod EU 1");
        cluster.Endpoint.ShouldBe(endpoint);
        cluster.Environment.ShouldBe(ClusterEnvironment.Staging);
        cluster.WebConsoleUrl.ShouldBe(ConsoleUrl);
        cluster.Description.ShouldBe("Main cluster");
        cluster.IsEnabled.ShouldBeFalse();
        cluster.ConnectionSettingsChangedAt.ShouldBe(Now);
        cluster.CreatedAt.ShouldBe(Now);
        cluster.CreatedBy.ShouldBe("admin");
        cluster.UpdatedAt.ShouldBeNull();
        cluster.UpdatedBy.ShouldBeNull();
        cluster.Version.ShouldBe(0u);
        cluster.DomainEvents.ShouldBe([
            new ClusterRegistered(cluster.Id, "prod-eu-1", ClusterEnvironment.Staging, ApiUrl, ClusterTlsMode.CaBundle, false),
        ]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Register_DefaultsDisplayNameToName_AndStoresBlankDescriptionAsNull(string? blank)
    {
        var cluster = Cluster.Register(
            NameOf("dev-1"), blank, Endpoint(), ClusterEnvironment.Development, null, blank, true, "admin", Now);

        cluster.DisplayName.ShouldBe("dev-1");
        cluster.Description.ShouldBeNull();
        cluster.WebConsoleUrl.ShouldBeNull();
    }

    [Fact]
    public void Register_GuardsArguments()
    {
        Should.Throw<ArgumentException>(() => Register(actor: " "));
        Should.Throw<ArgumentException>(() => Register(now: default(DateTimeOffset)));
        Should.Throw<ArgumentOutOfRangeException>(() => Register(environment: (ClusterEnvironment)9));
        Should.Throw<ArgumentOutOfRangeException>(() => Register(displayName: new string('x', Cluster.MaxDisplayNameLength + 1)));
        Should.Throw<ArgumentOutOfRangeException>(() => Register(description: new string('x', Cluster.MaxDescriptionLength + 1)));
        Should.Throw<ArgumentException>(() => Register(webConsoleUrl: new Uri("http://console.example.com")));
        Should.Throw<ArgumentException>(() => Register(webConsoleUrl: new Uri("/console", UriKind.Relative)));
    }

    [Fact]
    public void ClusterEnvironment_DeclarationOrder_IsSortOrder()
    {
        Enum.GetValues<ClusterEnvironment>().Order().ShouldBe(
            [ClusterEnvironment.Production, ClusterEnvironment.Staging, ClusterEnvironment.Development]);
    }

    // ---- name immutability (CLU-1, QG-1) ----------------------------------------------------------------------------

    [Fact]
    public void Name_HasNoPublicSetter_AndIsInitOnly()
    {
        var property = typeof(Cluster).GetProperty(nameof(Cluster.Name))!;
        var setter = property.SetMethod.ShouldNotBeNull();

        setter.IsPublic.ShouldBeFalse();
        setter.ReturnParameter.GetRequiredCustomModifiers().ShouldContain(typeof(IsExternalInit));
    }

    [Fact]
    public void Name_CannotBeChangedByAnyMethod()
    {
        // Register is the only public member that accepts a ClusterName, so no behaviour method can rename a cluster.
        var methodsTakingAName = typeof(Cluster)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Where(m => m.GetParameters().Any(p => p.ParameterType == typeof(ClusterName)))
            .Select(m => m.Name);

        methodsTakingAName.ShouldBe([nameof(Cluster.Register)]);
    }

    // ---- update (CLU-4) ---------------------------------------------------------------------------------------------

    [Fact]
    public void Update_WithIdenticalValues_ChangesNothing_AndRaisesNoEvent()
    {
        var cluster = Registered();

        cluster.Update("Prod EU 1", Endpoint(ApiUrl + "/"), ClusterEnvironment.Production, ConsoleUrl, "Main", "bob", Later);

        cluster.DomainEvents.ShouldBeEmpty();
        cluster.UpdatedAt.ShouldBeNull();
        cluster.UpdatedBy.ShouldBeNull();
        cluster.ConnectionSettingsChangedAt.ShouldBe(Now);
    }

    [Fact]
    public void Update_BlankDisplayNameEqualToName_IsNoChange()
    {
        var cluster = Cluster.Register(
            NameOf("prod-eu-1"), null, Endpoint(), ClusterEnvironment.Production, null, null, true, "admin", Now);
        cluster.ClearDomainEvents();

        cluster.Update("  ", Endpoint(), ClusterEnvironment.Production, null, "", "bob", Later);

        cluster.DomainEvents.ShouldBeEmpty();
    }

    public static TheoryData<string, bool> SingleFieldChanges => new()
    {
        { "displayName", false },
        { "apiUrl", true },
        { "environment", false },
        { "webConsoleUrl", false },
        { "description", false },
        { "caBundle", true },
        { "skipTlsVerify", true },
    };

    [Theory]
    [MemberData(nameof(SingleFieldChanges))]
    public void Update_SingleField_ReportsIt_AndMovesConnectionSettingsOnlyForEndpointFields(string field, bool isEndpoint)
    {
        var cluster = Registered();
        var displayName = "Prod EU 1";
        var endpoint = Endpoint();
        var environment = ClusterEnvironment.Production;
        var webConsoleUrl = ConsoleUrl;
        var description = "Main";
        switch (field)
        {
            case "displayName": displayName = "Production EU"; break;
            case "apiUrl": endpoint = Endpoint("https://api.other.example.com:6443"); break;
            case "environment": environment = ClusterEnvironment.Staging; break;
            case "webConsoleUrl": webConsoleUrl = new Uri("https://console.other.example.com"); break;
            case "description": description = "Changed"; break;
            case "caBundle": endpoint = Endpoint(caBundlePem: CertificatePem()); break;
            case "skipTlsVerify": endpoint = Endpoint(skipTlsVerify: true); break;
            default: throw new ArgumentOutOfRangeException(nameof(field));
        }

        cluster.Update(displayName, endpoint, environment, webConsoleUrl, description, "bob", Later);

        var updated = cluster.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<ClusterUpdated>();
        updated.ClusterId.ShouldBe(cluster.Id);
        updated.Name.ShouldBe("prod-eu-1");
        updated.ChangedFields.ShouldBe([field]);
        cluster.ConnectionSettingsChangedAt.ShouldBe(isEndpoint ? Later : Now);
        cluster.UpdatedAt.ShouldBe(Later);
        cluster.UpdatedBy.ShouldBe("bob");
    }

    [Fact]
    public void Update_AppliesAllValues_AndListsChangedFieldsInRequestOrder()
    {
        var cluster = Registered();
        var endpoint = Endpoint("https://api.new.example.com", CertificatePem());

        cluster.Update(null, endpoint, ClusterEnvironment.Development, null, null, "bob", Later);

        cluster.DisplayName.ShouldBe("prod-eu-1");
        cluster.Endpoint.ShouldBe(endpoint);
        cluster.Environment.ShouldBe(ClusterEnvironment.Development);
        cluster.WebConsoleUrl.ShouldBeNull();
        cluster.Description.ShouldBeNull();
        cluster.Name.Value.ShouldBe("prod-eu-1");
        cluster.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<ClusterUpdated>().ChangedFields.ShouldBe(
            ["displayName", "apiUrl", "environment", "webConsoleUrl", "description", "caBundle"]);
    }

    [Fact]
    public void Update_ReplacingCaBundleWithAnother_IsACaBundleChange()
    {
        var cluster = Registered(Endpoint(caBundlePem: CertificatePem("old")));

        cluster.Update("Prod EU 1", Endpoint(caBundlePem: CertificatePem("new")), ClusterEnvironment.Production,
            ConsoleUrl, "Main", "bob", Later);

        cluster.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<ClusterUpdated>().ChangedFields.ShouldBe(["caBundle"]);
        cluster.ConnectionSettingsChangedAt.ShouldBe(Later);
    }

    [Fact]
    public void Update_SwitchingFromCaBundleToSkip_ReportsBothFields()
    {
        var cluster = Registered(Endpoint(caBundlePem: CertificatePem()));

        cluster.Update("Prod EU 1", Endpoint(skipTlsVerify: true), ClusterEnvironment.Production, ConsoleUrl, "Main",
            "bob", Later);

        cluster.DomainEvents.ShouldHaveSingleItem().ShouldBeOfType<ClusterUpdated>().ChangedFields
            .ShouldBe(["caBundle", "skipTlsVerify"]);
    }

    // ---- enable / disable (CLU-5) -----------------------------------------------------------------------------------

    [Fact]
    public void Disable_ThenEnable_RaiseEvents_AndStampUpdate()
    {
        var cluster = Registered();

        cluster.Disable("bob", Later);
        cluster.IsEnabled.ShouldBeFalse();
        cluster.UpdatedAt.ShouldBe(Later);
        cluster.UpdatedBy.ShouldBe("bob");

        cluster.Enable("carol", Later.AddMinutes(1));
        cluster.IsEnabled.ShouldBeTrue();
        cluster.UpdatedBy.ShouldBe("carol");

        cluster.DomainEvents.ShouldBe([
            new ClusterDisabled(cluster.Id, "prod-eu-1"),
            new ClusterEnabled(cluster.Id, "prod-eu-1"),
        ]);
    }

    [Fact]
    public void EnableAndDisable_AreIdempotent_WithoutEvents()
    {
        var enabled = Registered();
        enabled.Enable("bob", Later);
        enabled.DomainEvents.ShouldBeEmpty();
        enabled.UpdatedAt.ShouldBeNull();

        var disabled = NewCluster(isEnabled: false);
        disabled.Disable("bob", Later);
        disabled.DomainEvents.ShouldBeEmpty();
        disabled.UpdatedAt.ShouldBeNull();
    }

    [Fact]
    public void EnableAndDisable_DoNotTouchConnectionSettings()
    {
        var cluster = Registered();

        cluster.Disable("bob", Later);

        cluster.ConnectionSettingsChangedAt.ShouldBe(Now);
    }

    // ---- delete (CLU-6) ---------------------------------------------------------------------------------------------

    [Fact]
    public void MarkForDeletion_WhileEnabled_FailsWithNotDisabled_AndRaisesNoEvent()
    {
        var cluster = Registered();

        var result = cluster.MarkForDeletion(3, 14);

        result.IsFailure.ShouldBeTrue();
        result.Error.Code.ShouldBe("Clusters.NotDisabled");
        result.Error.Type.ShouldBe(ErrorType.Conflict);
        result.Error.Message.ShouldBe("Disable prod-eu-1 before deleting it.");
        cluster.DomainEvents.ShouldBeEmpty();
    }

    [Fact]
    public void MarkForDeletion_WhenDisabled_RaisesClusterDeletedWithCounts()
    {
        var cluster = NewCluster(isEnabled: false);

        var result = cluster.MarkForDeletion(3, 14);

        result.IsSuccess.ShouldBeTrue();
        cluster.DomainEvents.ShouldBe([new ClusterDeleted(cluster.Id, "prod-eu-1", 3, 14)]);
    }

    [Fact]
    public void MarkForDeletion_GuardsCounts()
    {
        var cluster = NewCluster(isEnabled: false);

        Should.Throw<ArgumentOutOfRangeException>(() => cluster.MarkForDeletion(-1, 0));
        Should.Throw<ArgumentOutOfRangeException>(() => cluster.MarkForDeletion(0, -1));
    }

    // ---- errors (contract §2) ---------------------------------------------------------------------------------------

    [Fact]
    public void Errors_HaveContractCodesAndTypes()
    {
        ClusterErrors.NotFound("x").ShouldBe(new Error("Clusters.NotFound", "Cluster x was not found.", ErrorType.NotFound));
        ClusterErrors.NameTaken("prod-eu-1")
            .ShouldBe(new Error("Clusters.NameTaken", "Cluster prod-eu-1 already exists.", ErrorType.Conflict));
    }

    private static Cluster Registered(ApiServerEndpoint? endpoint = null)
    {
        var cluster = Cluster.Register(
            NameOf("prod-eu-1"), "Prod EU 1", endpoint ?? Endpoint(), ClusterEnvironment.Production, ConsoleUrl, "Main",
            isEnabled: true, "admin", Now);
        cluster.ClearDomainEvents();
        return cluster;
    }

    private static Cluster Register(
        string? displayName = null,
        ClusterEnvironment environment = ClusterEnvironment.Production,
        Uri? webConsoleUrl = null,
        string? description = null,
        string actor = "admin",
        DateTimeOffset? now = null) =>
        Cluster.Register(
            NameOf(), displayName, Endpoint(), environment, webConsoleUrl, description, true, actor, now ?? Now);
}
