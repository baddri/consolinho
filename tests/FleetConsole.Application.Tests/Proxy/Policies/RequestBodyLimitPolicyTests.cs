using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.Policies;
using Microsoft.Extensions.Options;
using static FleetConsole.Application.Tests.Proxy.ProxyTestRequests;

namespace FleetConsole.Application.Tests.Proxy.Policies;

/// <summary>MUT-5: a mutation's declared body may not exceed <c>Proxy:MaxMutationBodyBytes</c>.</summary>
public sealed class RequestBodyLimitPolicyTests
{
    private const long Limit = 10 * 1024 * 1024;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("PUT", Pod, Limit + 1, "Proxy.BodyTooLarge")]
    [InlineData("POST", Pods, long.MaxValue, "Proxy.BodyTooLarge")]
    [InlineData("PUT", Pod, Limit, null)]       // at the limit
    [InlineData("PUT", Pod, 0L, null)]
    [InlineData("PUT", Pod, null, null)]        // unknown length (chunked)
    [InlineData("GET", Pods, Limit + 1, null)]  // not a mutation
    [InlineData("POST", Ssar, Limit + 1, null)] // access reviews aren't mutations
    public async Task Refuses_only_oversized_mutations(string method, string path, long? contentLength, string? expectedCode)
    {
        var policy = new RequestBodyLimitPolicy(Options.Create(new ProxyOptions()));

        var result = await policy.EvaluateAsync(Context(Request(method, path, contentLength)), Ct);

        if (expectedCode is null)
        {
            result.IsSuccess.ShouldBeTrue();
        }
        else
        {
            result.Error!.Code.ShouldBe(expectedCode);
            result.Error.Message.ShouldBe("The request body is larger than the 10 MiB limit.");
        }
    }

    [Fact]
    public async Task Uses_the_configured_limit()
    {
        var policy = new RequestBodyLimitPolicy(Options.Create(new ProxyOptions { MaxMutationBodyBytes = 1000 }));

        var over = await policy.EvaluateAsync(Context(Request("PUT", Pod, 1001)), Ct);
        var at = await policy.EvaluateAsync(Context(Request("PUT", Pod, 1000)), Ct);

        over.Error!.Message.ShouldBe("The request body is larger than the 1000 bytes limit.");
        at.IsSuccess.ShouldBeTrue();
    }
}
