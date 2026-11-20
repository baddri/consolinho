using System.Net;
using FleetConsole.Domain.Users;
using static FleetConsole.Api.Tests.Integration.Admin.Users.UsersApi;
using static FleetConsole.Api.Tests.Integration.AuthEndpointsTests;

namespace FleetConsole.Api.Tests.Integration.Admin.Users;

/// <summary>
/// ADM-5 (last active writable admin) and USR-4 (deactivation ends sessions) through HTTP. Both depend on who else is in
/// the database, so every test runs on its own variant host with a fresh database. The acting admin is always an active
/// writable admin when the request passes the read-only guard, so the demote/deactivate cases use a stale session
/// (default 60 s revalidation): the actor is made read-only below HTTP, leaving the target as the only writable admin.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class LastAdminTests(ApiFactory factory)
{
    [Fact]
    public async Task SetReadOnly_OnSelf_AsOnlyWritableAdmin_Is409LastAdmin()
    {
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>());
        var admin = await host.Data.UserAsync(role: UserRole.Admin);
        using var client = await host.LoginAsAsync(admin.Username);

        await ProblemAsync(await SetReadOnlyAsync(client, admin.Username, true), HttpStatusCode.Conflict, "Users.LastAdmin");
    }

    [Fact]
    public async Task DemoteOrDeactivate_TheOnlyOtherWritableAdmin_Is409LastAdmin()
    {
        await using var host = await factory.CreateVariantAsync(new Dictionary<string, string?>());
        var actor = await host.Data.UserAsync(role: UserRole.Admin);
        var target = await host.Data.UserAsync(role: UserRole.Admin);
        using var client = await host.LoginAsAsync(actor.Username);

        // The session still says "writable admin" until revalidation; the database now counts only the target.
        await host.Data.SetReadOnlyAsync(actor.Username, isReadOnly: true);

        await ProblemAsync(await ChangeRoleAsync(client, target.Username, "user"), HttpStatusCode.Conflict, "Users.LastAdmin");
        await ProblemAsync(await TransitionAsync(client, target.Username, "deactivate"), HttpStatusCode.Conflict, "Users.LastAdmin");
        (await host.Data.FindUserAsync(target.Username)).ShouldNotBeNull().IsActiveWritableAdmin.ShouldBeTrue();
    }

    [Fact]
    public async Task Deactivate_EndsTheUsersSession_AndKeepsGrants()
    {
        // USR-4 with revalidation on every request.
        await using var host = await factory.CreateVariantAsync(
            new Dictionary<string, string?> { ["Auth:RevalidationInterval"] = "00:00:00" });
        var admin = await host.Data.UserAsync(role: UserRole.Admin);
        var user = await host.Data.UserAsync();
        var cluster = await host.Data.ClusterAsync();
        var credential = await host.Data.CredentialAsync(cluster.Name);
        await host.Data.GrantAsync(user.Username, cluster.Name, credential.Id);
        using var adminClient = await host.LoginAsAsync(admin.Username);
        using var userClient = await host.LoginAsAsync(user.Username);
        (await userClient.MeStatusAsync()).ShouldBe(HttpStatusCode.OK);

        var deactivated = await OkAsync(await TransitionAsync(adminClient, user.Username, "deactivate"));

        deactivated.GetProperty("grantCount").GetInt32().ShouldBe(1);
        (await userClient.MeStatusAsync()).ShouldBe(HttpStatusCode.Unauthorized);
    }
}
