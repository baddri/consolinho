using FleetConsole.Application.Proxy.Requests;

namespace FleetConsole.Application.Tests.Proxy.Requests;

/// <summary>PRX-4: <see cref="ProxyPath.TryParse"/> accepts Kubernetes API paths unchanged and rejects everything else.</summary>
public sealed class ProxyPathTests
{
    [Theory]
    [InlineData("/api")]
    [InlineData("/api/")]
    [InlineData("/apis")]
    [InlineData("/api/v1/pods")]
    [InlineData("/api/v1/namespaces/shop/pods")]
    [InlineData("/apis/apps/v1/namespaces/a/deployments/b/scale")]
    [InlineData("/apis/apps/v1/namespaces/a/deployments/b/")]
    [InlineData("/version")]
    [InlineData("/openapi/v3")]
    [InlineData("/openapi/v3/apis/apps/v1")]
    [InlineData("/.well-known/openid-configuration")]
    [InlineData("/api/v1/namespaces/a/pods/web%3A1")] // other escapes pass through unchanged
    [InlineData("/api/v1/namespaces/a/pods/web%3a1")]
    [InlineData("/api/v1/namespaces/a/pods/caf%C3%A9")]
    [InlineData("/api/v1/namespaces/a/configmaps/..data")] // ".." only as a whole segment is a traversal
    [InlineData("/api/v1/namespaces/a/configmaps/.hidden")]
    public void Accepts_KubernetesApiPaths_Unchanged(string raw)
    {
        ProxyPath.TryParse(raw, out var path).ShouldBeTrue();

        path.Value.ShouldBe(raw);
        path.ToString().ShouldBe(raw);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("/")]
    [InlineData("api/v1/pods")]
    [InlineData("/healthz")]
    [InlineData("/apiz")]
    [InlineData("/API/v1/pods")]
    [InlineData("/metrics")]
    [InlineData("/api/../x")]
    [InlineData("/api/v1/..")]
    [InlineData("/api/%2e%2e/x")]
    [InlineData("/api/%2E%2E/x")]
    [InlineData("/api/v1/%2F")]
    [InlineData("/api/v1/%2f")]
    [InlineData("/api/v1/pods%5cx")]
    [InlineData("/api/v1/pods%5Cx")]
    [InlineData("//evil.example/api")]
    [InlineData("/api//v1/pods")]
    [InlineData("/api\\v1")]
    [InlineData("https://x/api")]
    [InlineData("/api/https://x")]
    [InlineData("/api/v1/./pods")]
    [InlineData("/api/v1/pods/.")]
    [InlineData("/api/v1/pods?x")]
    [InlineData("/api/v1/pods#x")]
    [InlineData("/api/v1/po\u0000ds")]
    [InlineData("/api/v1/po\nds")]
    [InlineData("/api/v1/po\u007fds")]
    [InlineData("/.well-knownx/a")]
    // malformed or control-character escapes (review round 1, finding 2)
    [InlineData("/api/v1/pods/a%")]
    [InlineData("/api/v1/pods/a%4")]
    [InlineData("/api/v1/pods/%z1")]
    [InlineData("/api/v1/pods/%4g")]
    [InlineData("/api/v1/pods/%%41")]
    [InlineData("/api/v1/pods/a%00b")]
    [InlineData("/api/v1/pods/a%0Ab")]
    [InlineData("/api/v1/pods/a%0db")]
    [InlineData("/api/v1/pods/a%7Fb")]
    [InlineData("/%61pi/v1/pods")] // encoded root is not a known prefix: rejected, never rewritten
    public void Rejects_UnsafeOrForeignPaths(string? raw)
    {
        ProxyPath.TryParse(raw, out var path).ShouldBeFalse();

        path.ShouldBeNull();
    }

    [Fact]
    public void Equality_IsByValue()
    {
        ProxyPath.TryParse("/api/v1/pods", out var a).ShouldBeTrue();
        ProxyPath.TryParse("/api/v1/pods", out var b).ShouldBeTrue();

        a.ShouldBe(b);
    }
}
