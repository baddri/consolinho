using FleetConsole.Application.Proxy.Requests;

namespace FleetConsole.Application.Tests.Proxy.Requests;

/// <summary>QG-2: the path parser mirrors the apiserver's <c>RequestInfoFactory</c> for the shapes the console uses.</summary>
public sealed class KubernetesRequestInfoTests
{
    [Theory]
    // core vs named group, cluster-scoped
    [InlineData("/api/v1/nodes", "", "v1", null, "nodes", null, null, "nodes")]
    [InlineData("/api/v1/nodes/n1", "", "v1", null, "nodes", null, "n1", "nodes/n1")]
    [InlineData("/api/v1/nodes/n1/proxy/metrics", "", "v1", null, "nodes", "proxy", "n1", "nodes/n1/proxy")]
    [InlineData("/apis/rbac.authorization.k8s.io/v1/clusterroles/admin", "rbac.authorization.k8s.io", "v1", null,
        "clusterroles", null, "admin", "clusterroles.rbac.authorization.k8s.io/admin")]
    [InlineData("/api/v1/pods", "", "v1", null, "pods", null, null, "pods")]
    [InlineData("/api/v1/pods/", "", "v1", null, "pods", null, null, "pods")]
    // namespaced collection / object / subresource
    [InlineData("/api/v1/namespaces/shop/pods", "", "v1", "shop", "pods", null, null, "shop/pods")]
    [InlineData("/api/v1/namespaces/shop/configmaps/web", "", "v1", "shop", "configmaps", null, "web",
        "shop/configmaps/web")]
    [InlineData("/api/v1/namespaces/shop/pods/web-1/log", "", "v1", "shop", "pods", "log", "web-1",
        "shop/pods/web-1/log")]
    [InlineData("/api/v1/namespaces/shop/pods/web-1/eviction", "", "v1", "shop", "pods", "eviction", "web-1",
        "shop/pods/web-1/eviction")]
    [InlineData("/api/v1/namespaces/shop/pods/web-1/exec", "", "v1", "shop", "pods", "exec", "web-1",
        "shop/pods/web-1/exec")]
    [InlineData("/apis/apps/v1/namespaces/shop/deployments", "apps", "v1", "shop", "deployments", null, null,
        "shop/deployments.apps")]
    [InlineData("/apis/apps/v1/namespaces/shop/deployments/web/scale", "apps", "v1", "shop", "deployments", "scale",
        "web", "shop/deployments.apps/web/scale")]
    [InlineData("/apis/route.openshift.io/v1/namespaces/shop/routes/web%3Ab", "route.openshift.io", "v1", "shop",
        "routes", null, "web:b", "shop/routes.route.openshift.io/web:b")]
    // segments are classified decoded, like the apiserver routes them (review round 1, finding 1)
    [InlineData("/api/v1/namespaces/shop/pods/b/%65xec", "", "v1", "shop", "pods", "exec", "b", "shop/pods/b/exec")]
    [InlineData("/api/v1/namespaces/shop/pods/b/%45xec", "", "v1", "shop", "pods", "Exec", "b", "shop/pods/b/Exec")]
    [InlineData("/api/v1/namespaces/shop/services/s/%70roxy/admin", "", "v1", "shop", "services", "proxy", "s",
        "shop/services/s/proxy")]
    [InlineData("/api/v1/namespaces/shop/services/s/pr%6fxy/admin", "", "v1", "shop", "services", "proxy", "s",
        "shop/services/s/proxy")]
    [InlineData("/api/v1/namespaces/shop/services/s/pr%6Fxy/admin", "", "v1", "shop", "services", "proxy", "s",
        "shop/services/s/proxy")]
    [InlineData("/api/v1/n%61mespaces/shop/pods", "", "v1", "shop", "pods", null, null, "shop/pods")]
    [InlineData("/api/v1/n%61mespaces/shop", "", "v1", null, "namespaces", null, "shop", "namespaces/shop")]
    [InlineData("/apis/%61pps/v1/namespaces/shop/deployments/a+b", "apps", "v1", "shop", "deployments", null, "a+b",
        "shop/deployments.apps/a+b")]
    [InlineData("/apis/authorization.k8s.io/v1/self%73ubjectaccessreviews", "authorization.k8s.io", "v1", null,
        "selfsubjectaccessreviews", null, null, "selfsubjectaccessreviews.authorization.k8s.io")]
    // the namespace object and its subresources
    [InlineData("/api/v1/namespaces", "", "v1", null, "namespaces", null, null, "namespaces")]
    [InlineData("/api/v1/namespaces/shop", "", "v1", null, "namespaces", null, "shop", "namespaces/shop")]
    [InlineData("/api/v1/namespaces/shop/finalize", "", "v1", null, "namespaces", "finalize", "shop",
        "namespaces/shop/finalize")]
    [InlineData("/api/v1/namespaces/shop/status", "", "v1", null, "namespaces", "status", "shop",
        "namespaces/shop/status")]
    // legacy /watch/ prefix
    [InlineData("/api/v1/watch/namespaces/shop/pods", "", "v1", "shop", "pods", null, null, "shop/pods")]
    [InlineData("/apis/apps/v1/watch/namespaces/shop/deployments/web", "apps", "v1", "shop", "deployments", null,
        "web", "shop/deployments.apps/web")]
    [InlineData("/api/v1/watch/nodes", "", "v1", null, "nodes", null, null, "nodes")]
    // authorization reviews
    [InlineData("/apis/authorization.k8s.io/v1/selfsubjectaccessreviews", "authorization.k8s.io", "v1", null,
        "selfsubjectaccessreviews", null, null, "selfsubjectaccessreviews.authorization.k8s.io")]
    public void Parses_ResourceRequests(
        string path, string group, string version, string? ns, string resource, string? subresource, string? name,
        string displayName)
    {
        var info = Parse(path);

        info.IsResourceRequest.ShouldBeTrue();
        info.Path.ShouldBe(path);
        info.Group.ShouldBe(group);
        info.Version.ShouldBe(version);
        info.Namespace.ShouldBe(ns);
        info.Resource.ShouldBe(resource);
        info.Subresource.ShouldBe(subresource);
        info.Name.ShouldBe(name);
        info.DisplayName.ShouldBe(displayName);
    }

    [Theory]
    [InlineData("/api")]
    [InlineData("/api/")]
    [InlineData("/api/v1")]
    [InlineData("/apis")]
    [InlineData("/apis/apps")]
    [InlineData("/apis/apps/v1")]
    [InlineData("/apis/apps/v1/")]
    [InlineData("/api/v1/watch")]
    [InlineData("/version")]
    [InlineData("/openapi/v2")]
    [InlineData("/openapi/v3/apis/apps/v1")]
    [InlineData("/.well-known/openid-configuration")]
    public void Parses_NonResourceRequests(string raw)
    {
        var info = Parse(raw);

        info.IsResourceRequest.ShouldBeFalse();
        info.Path.ShouldBe(raw);
        info.Group.ShouldBeNull();
        info.Version.ShouldBeNull();
        info.Namespace.ShouldBeNull();
        info.Resource.ShouldBeNull();
        info.Subresource.ShouldBeNull();
        info.Name.ShouldBeNull();
        info.DisplayName.ShouldBe(raw);
    }

    [Theory]
    [InlineData("/api/v1/watch/namespaces/shop/pods", true)]
    [InlineData("/apis/apps/v1/watch/deployments", true)]
    [InlineData("/api/v1/namespaces/watch/pods", false)] // a namespace called "watch"
    [InlineData("/api/v1/namespaces/shop/pods", false)]
    [InlineData("/api/v1/%77atch/namespaces/shop/pods", true)]
    public void Detects_LegacyWatchPrefix(string raw, bool expected) => Parse(raw).IsLegacyWatch.ShouldBe(expected);

    [Fact]
    public void Path_StaysRawForForwarding() =>
        Parse("/api/v1/namespaces/shop/pods/b/%65xec").Path.ShouldBe("/api/v1/namespaces/shop/pods/b/%65xec");

    [Theory]
    [InlineData("/api/v1/proxy/namespaces/shop/services/web/healthz")]
    [InlineData("/api/v1/%70roxy/namespaces/shop/services/web/healthz")]
    public void LegacyProxyPrefix_IsDetectedEncodedOrNot(string raw) => Parse(raw).IsLegacyProxy.ShouldBeTrue();

    [Fact]
    public void LegacyProxyPrefix_KeepsTheRestOutOfSubresource()
    {
        var info = Parse("/api/v1/proxy/namespaces/shop/services/web/healthz");

        info.IsLegacyProxy.ShouldBeTrue();
        info.Resource.ShouldBe("services");
        info.Name.ShouldBe("web");
        info.Subresource.ShouldBeNull();
    }

    private static KubernetesRequestInfo Parse(string raw)
    {
        ProxyPath.TryParse(raw, out var path).ShouldBeTrue();
        return KubernetesRequestInfo.Parse(path);
    }
}
