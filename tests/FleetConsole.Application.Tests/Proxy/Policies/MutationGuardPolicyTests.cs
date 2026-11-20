using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.Policies;
using FleetConsole.Domain.Access;
using static FleetConsole.Application.Tests.Proxy.ProxyTestRequests;

namespace FleetConsole.Application.Tests.Proxy.Policies;

/// <summary>MUT-2/3: mutations are refused for read-only users (checked first) and through read-only grants.</summary>
public sealed class MutationGuardPolicyTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    // reads and access reviews pass whatever the grant and user
    [InlineData("GET", Pod, AccessMode.ReadOnly, true, null)]
    [InlineData("GET", Pod, AccessMode.ReadOnly, false, null)]
    [InlineData("GET", Pod, AccessMode.ReadWrite, true, null)]
    [InlineData("GET", Pod, AccessMode.ReadWrite, false, null)]
    [InlineData("POST", Ssar, AccessMode.ReadOnly, true, null)]
    [InlineData("POST", Ssar, AccessMode.ReadOnly, false, null)]
    [InlineData("POST", Ssar, AccessMode.ReadWrite, true, null)]
    [InlineData("POST", Ssar, AccessMode.ReadWrite, false, null)]
    // mutations: user read-only wins over a read-only grant; session/stored read-only alone also denies
    [InlineData("PUT", Pod, AccessMode.ReadOnly, true, "Proxy.UserReadOnly")]
    [InlineData("PUT", Pod, AccessMode.ReadOnly, false, "Proxy.ReadOnlyGrant")]
    [InlineData("PUT", Pod, AccessMode.ReadWrite, true, "Proxy.UserReadOnly")]
    [InlineData("PUT", Pod, AccessMode.ReadWrite, false, null)]
    [InlineData("DELETE", Pod, AccessMode.ReadOnly, true, "Proxy.UserReadOnly")]
    [InlineData("DELETE", Pod, AccessMode.ReadOnly, false, "Proxy.ReadOnlyGrant")]
    [InlineData("DELETE", Pod, AccessMode.ReadWrite, true, "Proxy.UserReadOnly")]
    [InlineData("DELETE", Pod, AccessMode.ReadWrite, false, null)]
    // exec is a mutation even as a GET (WebSocket upgrade)
    [InlineData("GET", Exec, AccessMode.ReadOnly, true, "Proxy.UserReadOnly")]
    [InlineData("GET", Exec, AccessMode.ReadOnly, false, "Proxy.ReadOnlyGrant")]
    [InlineData("GET", Exec, AccessMode.ReadWrite, true, "Proxy.UserReadOnly")]
    [InlineData("GET", Exec, AccessMode.ReadWrite, false, null)]
    public async Task Decides_by_mutation_user_and_grant(
        string method, string path, AccessMode grantMode, bool userIsReadOnly, string? expectedCode)
    {
        var context = Context(Request(method, path, isUpgrade: path == Exec), grantMode, userIsReadOnly);

        var result = await new MutationGuardPolicy().EvaluateAsync(context, Ct);

        if (expectedCode is null)
        {
            result.IsSuccess.ShouldBeTrue();
        }
        else
        {
            result.Error!.Code.ShouldBe(expectedCode);
        }
    }

    [Fact]
    public async Task Messages_match_the_contract()
    {
        var policy = new MutationGuardPolicy();

        var user = await policy.EvaluateAsync(Context(Request("DELETE", Pod), userIsReadOnly: true), Ct);
        var grant = await policy.EvaluateAsync(Context(Request("DELETE", Pod), AccessMode.ReadOnly), Ct);

        user.Error.ShouldBe(ProxyErrors.UserReadOnly);
        user.Error!.Message.ShouldBe("Your account is read-only.");
        grant.Error!.Message.ShouldBe("Your access to prod-east is read-only.");
    }
}
