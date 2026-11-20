using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.Requests;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Tests.Proxy;

/// <summary>Builders for classified proxy requests and policy contexts.</summary>
internal static class ProxyTestRequests
{
    public const string Pods = "/api/v1/namespaces/shop/pods";
    public const string Pod = "/api/v1/namespaces/shop/pods/web-1";
    public const string Exec = "/api/v1/namespaces/shop/pods/web-1/exec";
    public const string Ssar = "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews";

    public static ProxyRequest Request(string method, string path, long? contentLength = null, bool isUpgrade = false)
    {
        ProxyPath.TryParse(path, out var parsed).ShouldBeTrue();
        return ProxyRequest.Create(method, parsed!, "", isUpgrade, contentLength);
    }

    public static ProxyRequestContext Context(
        ProxyRequest request,
        AccessMode grantMode = AccessMode.ReadWrite,
        bool userIsReadOnly = false) =>
        new(UserId.New(), "alice", "prod-east", ClusterEnvironment.Production, grantMode, userIsReadOnly, request);
}
