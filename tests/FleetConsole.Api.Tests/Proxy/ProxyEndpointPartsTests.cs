using System.Net.Http;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Authentication;
using FleetConsole.Api.Proxy;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Proxy;
using FleetConsole.Application.Proxy.Requests;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;
using Microsoft.AspNetCore.Http;
using Yarp.ReverseProxy.Forwarder;

namespace FleetConsole.Api.Tests.Proxy;

/// <summary>
/// Unit tests of the proxy endpoint's pure parts: raw-target splitting, destination URL, error status table, forwarder
/// error mapping and options validation. The HTTP behaviour is covered by <c>Integration/Proxy</c>.
/// </summary>
public sealed class ProxyEndpointPartsTests
{
    [Theory]
    [InlineData("/api/clusters/dev-1/k8s/api/v1/pods?limit=5", "/api/v1/pods", "?limit=5")]
    [InlineData("/API/Clusters/dev-1/K8S/version", "/version", "")]
    [InlineData("/api/clusters/dev%2D1/k8s/api", "/api", "")]
    [InlineData("/api/clusters/dev-1/k8s", "", "")]
    [InlineData("/api/clusters/dev-1/k8s/", "/", "")]
    [InlineData("/api/clusters/dev-1/k8s?x=1", "", "?x=1")]
    public void Splits_The_Raw_Target_After_The_Route_Prefix(string raw, string path, string query)
    {
        KubernetesProxyEndpoint.TrySplitRawTarget(raw, "dev-1", out var actualPath, out var actualQuery).ShouldBeTrue();
        actualPath.ShouldBe(path);
        actualQuery.ShouldBe(query);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("*")]
    [InlineData("https://console.example/api/clusters/dev-1/k8s/api")]
    [InlineData("/api/clusters/other/k8s/api")]
    [InlineData("/api/clusters/x/../dev-1/k8s/api")]
    [InlineData("/api/clusters/dev-1/proxy/api")]
    [InlineData("/api/clusters/dev-1")]
    public void Rejects_Targets_Whose_Prefix_Is_Not_What_Routing_Matched(string? raw) =>
        KubernetesProxyEndpoint.TrySplitRawTarget(raw, "dev-1", out _, out _).ShouldBeFalse();

    [Theory]
    [InlineData("https://api.example:6443", "https://api.example:6443/api/v1/namespaces/a%3Ab?watch=1&timeoutSeconds=300")]
    [InlineData("https://api.example:6443/", "https://api.example:6443/api/v1/namespaces/a%3Ab?watch=1&timeoutSeconds=300")]
    [InlineData("https://gw.example/clusters/dev-1/", "https://gw.example/clusters/dev-1/api/v1/namespaces/a%3Ab?watch=1&timeoutSeconds=300")]
    public void Destination_Keeps_The_Api_Url_Prefix_And_The_Raw_Path(string apiUrl, string expected)
    {
        ProxyPath.TryParse("/api/v1/namespaces/a%3Ab", out var path).ShouldBeTrue();
        var request = ProxyRequest.Create("GET", path, "?watch=1&timeoutSeconds=9999", isUpgrade: false, contentLength: null);
        var target = new ProxyTarget(ClusterId.New(), "dev-1", new ClusterConnection(new Uri(apiUrl), null, false), new SensitiveString("fake"));

        var destination = new KubernetesRequestTransformer(target, request, 300).BuildDestination();

        destination.OriginalString.ShouldBe(expected);
    }

    [Fact]
    public void Every_Proxy_Error_Has_Its_Contract_Status()
    {
        ProxyProblems.StatusOf(ProxyErrors.PathNotAllowed).ShouldBe(400);
        ProxyProblems.StatusOf(ProxyErrors.OriginNotAllowed).ShouldBe(403);
        ProxyProblems.StatusOf(ProxyErrors.NotAvailable("c")).ShouldBe(404);
        ProxyProblems.StatusOf(ProxyErrors.NotAvailableUnnamed).ShouldBe(404);
        ProxyProblems.StatusOf(ProxyErrors.UserReadOnly).ShouldBe(403);
        ProxyProblems.StatusOf(ProxyErrors.ReadOnlyGrant("c")).ShouldBe(403);
        ProxyProblems.StatusOf(ProxyErrors.BodyTooLarge(1)).ShouldBe(413);
        ProxyProblems.StatusOf(ProxyErrors.CredentialRejected("c")).ShouldBe(502);
        ProxyProblems.StatusOf(ProxyErrors.UpstreamUnavailable("c")).ShouldBe(502);
        ProxyProblems.StatusOf(ProxyErrors.UpstreamTls("c")).ShouldBe(502);
        ProxyProblems.StatusOf(ProxyErrors.UpstreamTimeout("c")).ShouldBe(504);
        ProxyProblems.StatusOf(Error.Unauthorized("Auth.Unauthenticated", "x")).ShouldBe(401);

        // Guards the table against a new ProxyErrors member: every public Error member was listed above.
        var members = typeof(ProxyErrors).GetMembers(BindingFlags.Public | BindingFlags.Static)
            .Where(m => m is FieldInfo { FieldType.Name: nameof(Error) } or MethodInfo { ReturnType.Name: nameof(Error) })
            .Select(m => m.Name).Distinct().Order();
        members.ShouldBe(["BodyTooLarge", "CredentialRejected", "NotAvailable", "NotAvailableUnnamed", "OriginNotAllowed",
            "PathNotAllowed", "ReadOnlyGrant", "UpstreamTimeout", "UpstreamTls", "UpstreamUnavailable", "UserReadOnly"]);
    }

    [Fact]
    public void Maps_Forwarder_Errors_Without_Exception_Text()
    {
        var refused = new HttpRequestException(HttpRequestError.ConnectionError, "secret-url", new SocketException((int)SocketError.ConnectionRefused));
        var tls = new HttpRequestException(HttpRequestError.SecureConnectionError, "secret-url", new AuthenticationException("x"));
        var tooLarge = new HttpRequestException("x", new BadHttpRequestException("too large", StatusCodes.Status413PayloadTooLarge));

        ForwarderErrorMapper.Map(ForwarderError.Request, refused, "c", 10).ShouldBe(ProxyErrors.UpstreamUnavailable("c"));
        ForwarderErrorMapper.Map(ForwarderError.Request, tls, "c", 10).ShouldBe(ProxyErrors.UpstreamTls("c"));
        ForwarderErrorMapper.Map(ForwarderError.Request, new AuthenticationException("x"), "c", 10).ShouldBe(ProxyErrors.UpstreamTls("c"));
        ForwarderErrorMapper.Map(ForwarderError.RequestTimedOut, null, "c", 10).ShouldBe(ProxyErrors.UpstreamTimeout("c"));
        ForwarderErrorMapper.Map(ForwarderError.RequestBodyClient, tooLarge, "c", 10).ShouldBe(ProxyErrors.BodyTooLarge(10));
        ForwarderErrorMapper.Map(ForwarderError.RequestCanceled, new OperationCanceledException(), "c", 10).ShouldBeNull();
        ForwarderErrorMapper.Map(ForwarderError.ResponseBodyClient, null, "c", 10).ShouldBeNull();
        ForwarderErrorMapper.Map(ForwarderError.None, null, "c", 10).ShouldBeNull();
        ForwarderErrorMapper.IsClientSide(ForwarderError.RequestCanceled).ShouldBeTrue();
        ForwarderErrorMapper.IsClientSide(ForwarderError.Request).ShouldBeFalse();
    }

    [Theory]
    [InlineData("00:00:30", "00:05:00", 1, "01:00:00", true)]
    [InlineData("00:00:00", "00:05:00", 1, "01:00:00", false)]
    [InlineData("00:00:30", "00:00:00.500", 1, "01:00:00", false)]
    [InlineData("00:00:30", "00:00:01.500", 1, "01:00:00", false)]
    [InlineData("00:00:30", "00:00:01", 1, "01:00:00", true)]
    [InlineData("00:00:30", "00:05:00", 0, "01:00:00", false)]
    [InlineData("00:00:30", "00:05:00", 1, "00:00:01", true)]
    [InlineData("00:00:30", "00:05:00", 1, "00:00:00", false)]
    [InlineData("00:00:30", "00:05:00", 1, "-00:00:05", false)]
    [InlineData("00:00:30", "00:05:00", 1, "00:00:02.500", false)]
    [InlineData("00:00:30", "00:05:00", 1, "01:00:00", true, "00:00:00")]
    [InlineData("00:00:30", "00:05:00", 1, "01:00:00", true, "00:00:04")]
    [InlineData("00:00:30", "00:05:00", 1, "01:00:00", false, "-00:00:01")]
    public void Validates_Proxy_Options(string requestTimeout, string watchCap, long maxBytes, string execCap, bool valid, string slack = "00:00:30")
    {
        var options = new ProxyOptions
        {
            RequestTimeout = TimeSpan.Parse(requestTimeout, System.Globalization.CultureInfo.InvariantCulture),
            WatchTimeoutCap = TimeSpan.Parse(watchCap, System.Globalization.CultureInfo.InvariantCulture),
            MaxMutationBodyBytes = maxBytes,
            ExecSessionCap = TimeSpan.Parse(execCap, System.Globalization.CultureInfo.InvariantCulture),
            StreamIdleSlack = TimeSpan.Parse(slack, System.Globalization.CultureInfo.InvariantCulture),
        };

        new ProxyOptionsValidator().Validate(null, options).Succeeded.ShouldBe(valid);
    }

    // ADR-0036 §1: an upgrade lives (and may idle) until the exec cap, not the watch-derived stream idle timeout.
    [Fact]
    public void Stream_Lifetime_Is_The_Exec_Cap_For_Upgrades_And_The_Stream_Idle_Timeout_Otherwise()
    {
        var options = new ProxyOptions
        {
            WatchTimeoutCap = TimeSpan.FromSeconds(1),
            StreamIdleSlack = TimeSpan.FromSeconds(4),
            ExecSessionCap = TimeSpan.FromSeconds(10),
        };

        options.StreamLifetime(isUpgrade: true).ShouldBe(TimeSpan.FromSeconds(10));
        options.StreamLifetime(isUpgrade: false).ShouldBe(TimeSpan.FromSeconds(5), "watch cap + slack");
        new ProxyOptions().ExecSessionCap.ShouldBe(TimeSpan.FromHours(1));
        new ProxyOptions().StreamIdleTimeout.ShouldBe(TimeSpan.FromMinutes(5.5));
    }
}
