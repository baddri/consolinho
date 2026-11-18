using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Tests.Clusters;

public sealed class ApiServerEndpointTests
{
    private const string ShapeMessage =
        "API URL must contain only a host and an optional port (no path, query, fragment or user info).";

    private const string HttpsMessage = "API URL must be an absolute https:// URL.";

    public static TheoryData<string, string> ValidUrls => new()
    {
        { "https://api.prod-eu-1.example.com:6443", "https://api.prod-eu-1.example.com:6443" },
        { "https://api.prod-eu-1.example.com:6443/", "https://api.prod-eu-1.example.com:6443" },
        { "  https://api.example.com:6443  ", "https://api.example.com:6443" },
        { "https://API.Example.COM:6443", "https://api.example.com:6443" },
        { "HTTPS://api.example.com", "https://api.example.com" },
        { "https://api.example.com:443", "https://api.example.com" },
        { "https://10.0.0.1:6443", "https://10.0.0.1:6443" },
        { "https://[2001:db8::1]:6443", "https://[2001:db8::1]:6443" },
        { "https://localhost:6443", "https://localhost:6443" },
    };

    public static TheoryData<string?, string> InvalidUrls => new()
    {
        { null, "API URL is required." },
        { "", "API URL is required." },
        { "   ", "API URL is required." },
        { "https://" + new string('a', ApiServerEndpoint.MaxUrlLength), "API URL must be at most 2048 characters long." },
        { "http://api.example.com:6443", HttpsMessage },
        { "ftp://api.example.com", HttpsMessage },
        { "api.example.com:6443", HttpsMessage },
        { "/api", HttpsMessage },
        { "https://api.example .com", HttpsMessage },
        { "https://api.example.com:6443/k8s", ShapeMessage },
        { "https://api.example.com:6443/api/v1", ShapeMessage },
        { "https://api.example.com:6443?x=1", ShapeMessage },
        { "https://api.example.com:6443/?", ShapeMessage },
        { "https://api.example.com:6443#frag", ShapeMessage },
        { "https://api.example.com:6443/#", ShapeMessage },
        { "https://user:pass@api.example.com:6443", ShapeMessage },
        { "https://user@api.example.com", ShapeMessage },
    };

    [Theory]
    [MemberData(nameof(ValidUrls))]
    public void Create_AcceptsHostAndPortUrls_AndCanonicalizes(string url, string canonical)
    {
        var result = ApiServerEndpoint.Create(url, null, skipTlsVerify: false);

        result.IsSuccess.ShouldBeTrue();
        result.Value.ToString().ShouldBe(canonical);
        result.Value.Url.ShouldBe(new Uri(canonical));
    }

    [Theory]
    [MemberData(nameof(InvalidUrls))]
    public void Create_RejectsInvalidUrls_AsFieldErrorOnApiUrl(string? url, string message)
    {
        var result = ApiServerEndpoint.Create(url, null, skipTlsVerify: false);

        result.IsFailure.ShouldBeTrue();
        var error = result.Error.ShouldBeOfType<ValidationError>();
        error.Errors.Keys.ShouldBe(["apiUrl"]);
        error.Errors["apiUrl"].ShouldBe([message]);
    }

    [Fact]
    public void TlsMode_IsSystemTrust_WithoutBundleOrSkip()
    {
        var endpoint = ApiServerEndpoint.Create(DomainTestData.ApiUrl, "  ", skipTlsVerify: false).Value;

        endpoint.CaBundle.ShouldBeNull();
        endpoint.SkipTlsVerify.ShouldBeFalse();
        endpoint.TlsMode.ShouldBe(ClusterTlsMode.SystemTrust);
    }

    [Fact]
    public void TlsMode_IsCaBundle_WithBundle()
    {
        var pem = DomainTestData.CertificatePem();

        var endpoint = ApiServerEndpoint.Create(DomainTestData.ApiUrl, pem, skipTlsVerify: false).Value;

        endpoint.CaBundle.ShouldNotBeNull().Pem.ShouldBe(pem.Trim());
        endpoint.TlsMode.ShouldBe(ClusterTlsMode.CaBundle);
    }

    [Fact]
    public void TlsMode_IsSkipVerify_WithSkip()
    {
        var endpoint = ApiServerEndpoint.Create(DomainTestData.ApiUrl, null, skipTlsVerify: true).Value;

        endpoint.TlsMode.ShouldBe(ClusterTlsMode.SkipVerify);
    }

    [Fact]
    public void Create_RejectsSkipTogetherWithBundle_OnSkipTlsVerify()
    {
        var result = ApiServerEndpoint.Create(DomainTestData.ApiUrl, DomainTestData.CertificatePem(), skipTlsVerify: true);

        var error = result.Error.ShouldBeOfType<ValidationError>();
        error.Errors.Keys.ShouldBe(["skipTlsVerify"]);
        error.Errors["skipTlsVerify"].ShouldBe(["Skip TLS verification and a CA bundle are mutually exclusive."]);
    }

    [Fact]
    public void Create_ReportsEveryBrokenField()
    {
        var result = ApiServerEndpoint.Create("http://x", "garbage", skipTlsVerify: true);

        var error = result.Error.ShouldBeOfType<ValidationError>();
        error.Errors.Keys.ShouldBe(["apiUrl", "caBundle", "skipTlsVerify"], ignoreOrder: true);
        error.Errors["caBundle"].ShouldBe(["The CA bundle must contain at least one PEM certificate."]);
    }

    [Fact]
    public void Equality_IsByValue()
    {
        var pem = DomainTestData.CertificatePem();

        ApiServerEndpoint.Create(DomainTestData.ApiUrl, pem, false).Value
            .ShouldBe(ApiServerEndpoint.Create(DomainTestData.ApiUrl + "/", pem, false).Value);
        ApiServerEndpoint.Create(DomainTestData.ApiUrl, null, false).Value
            .ShouldNotBe(ApiServerEndpoint.Create(DomainTestData.ApiUrl, null, true).Value);
    }
}
