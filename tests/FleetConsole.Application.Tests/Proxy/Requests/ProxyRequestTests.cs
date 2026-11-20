using FleetConsole.Application.Proxy.Requests;

namespace FleetConsole.Application.Tests.Proxy.Requests;

/// <summary>
/// MUT-1/MUT-4 classification (verb, mutation, watch, streaming, audit fields) and PRX-8 watch-timeout capping of
/// <see cref="ProxyRequest"/>.
/// </summary>
public sealed class ProxyRequestTests
{
    private const string Collection = "/api/v1/namespaces/shop/pods";
    private const string Named = "/api/v1/namespaces/shop/pods/web-1";
    private const string Exec = "/api/v1/namespaces/shop/pods/web-1/exec";
    private const string Ssar = "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews";
    private const string Ssrr = "/apis/authorization.k8s.io/v1/selfsubjectrulesreviews";

    [Theory]
    // reads of a collection / named object
    [InlineData("GET", Collection, KubernetesVerb.List, false)]
    [InlineData("HEAD", Collection, KubernetesVerb.List, false)]
    [InlineData("OPTIONS", Collection, KubernetesVerb.List, false)]
    [InlineData("GET", Named, KubernetesVerb.Get, false)]
    [InlineData("HEAD", Named, KubernetesVerb.Get, false)]
    [InlineData("OPTIONS", Named, KubernetesVerb.Get, false)]
    [InlineData("GET", "/api/v1/namespaces/shop/pods/web-1/log", KubernetesVerb.Get, false)]
    [InlineData("GET", "/version", KubernetesVerb.Get, false)]
    [InlineData("GET", "/apis/apps/v1", KubernetesVerb.Get, false)]
    // writes
    [InlineData("POST", Collection, KubernetesVerb.Create, true)]
    [InlineData("PUT", Named, KubernetesVerb.Update, true)]
    [InlineData("PATCH", Named, KubernetesVerb.Patch, true)]
    [InlineData("DELETE", Named, KubernetesVerb.Delete, true)]
    [InlineData("DELETE", Collection, KubernetesVerb.DeleteCollection, true)]
    [InlineData("TRACE", Named, KubernetesVerb.Other, true)]
    [InlineData("get", Named, KubernetesVerb.Other, true)] // HTTP methods are case-sensitive; unknown = mutation
    [InlineData("POST", "/api/v1/namespaces/shop/pods/web-1/eviction", KubernetesVerb.Create, true)]
    [InlineData("PUT", "/apis/apps/v1/namespaces/shop/deployments/web/scale", KubernetesVerb.Update, true)]
    [InlineData("PUT", "/api/v1/namespaces/shop/finalize", KubernetesVerb.Update, true)]
    [InlineData("POST", "/version", KubernetesVerb.Create, true)]
    // connect subresources: every method is a mutation
    [InlineData("GET", Exec, KubernetesVerb.Connect, true)]
    [InlineData("HEAD", Exec, KubernetesVerb.Connect, true)]
    [InlineData("OPTIONS", Exec, KubernetesVerb.Connect, true)]
    [InlineData("POST", Exec, KubernetesVerb.Connect, true)]
    [InlineData("PUT", Exec, KubernetesVerb.Connect, true)]
    [InlineData("PATCH", Exec, KubernetesVerb.Connect, true)]
    [InlineData("DELETE", Exec, KubernetesVerb.Connect, true)]
    [InlineData("GET", "/api/v1/namespaces/shop/pods/web-1/attach", KubernetesVerb.Connect, true)]
    [InlineData("GET", "/api/v1/namespaces/shop/pods/web-1/portforward", KubernetesVerb.Connect, true)]
    [InlineData("GET", "/api/v1/namespaces/shop/services/web/proxy/healthz", KubernetesVerb.Connect, true)]
    [InlineData("GET", "/api/v1/nodes/n1/proxy/metrics", KubernetesVerb.Connect, true)]
    [InlineData("GET", "/api/v1/proxy/namespaces/shop/services/web/x", KubernetesVerb.Connect, true)] // legacy prefix
    // encoded connect subresources are still connect (review round 1, finding 1)
    [InlineData("GET", "/api/v1/namespaces/shop/pods/b/%65xec", KubernetesVerb.Connect, true)]
    [InlineData("GET", "/api/v1/namespaces/shop/pods/b/%61ttach", KubernetesVerb.Connect, true)]
    [InlineData("GET", "/api/v1/namespaces/shop/services/s/%70roxy/admin", KubernetesVerb.Connect, true)]
    [InlineData("GET", "/api/v1/nodes/n1/pr%6Fxy/metrics", KubernetesVerb.Connect, true)]
    [InlineData("POST", "/apis/authorization.k8s.io/v1/self%73ubjectrulesreviews", KubernetesVerb.Create, false)]
    // self reviews: a POST is a read, everything else on them follows the normal rules
    [InlineData("POST", Ssar, KubernetesVerb.Create, false)]
    [InlineData("POST", Ssrr, KubernetesVerb.Create, false)]
    [InlineData("GET", Ssar, KubernetesVerb.List, false)]
    [InlineData("PUT", Ssar, KubernetesVerb.Update, true)]
    [InlineData("PATCH", Ssrr, KubernetesVerb.Patch, true)]
    [InlineData("DELETE", Ssar, KubernetesVerb.DeleteCollection, true)]
    [InlineData("POST", "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews/x", KubernetesVerb.Create, true)]
    [InlineData("POST", "/apis/authorization.k8s.io/v1beta1/selfsubjectaccessreviews", KubernetesVerb.Create, true)]
    [InlineData("POST", "/apis/example.com/v1/selfsubjectaccessreviews", KubernetesVerb.Create, true)]
    [InlineData("POST", "/apis/authorization.k8s.io/v1/namespaces/a/selfsubjectaccessreviews", KubernetesVerb.Create, true)]
    [InlineData("POST", "/apis/authorization.k8s.io/v1/subjectaccessreviews", KubernetesVerb.Create, true)]
    [InlineData("POST", "/apis/authorization.k8s.io/v1/namespaces/a/localsubjectaccessreviews", KubernetesVerb.Create, true)]
    public void Classifies_VerbAndMutation(string method, string path, KubernetesVerb verb, bool isMutation)
    {
        var request = Create(method, path);

        request.Verb.ShouldBe(verb);
        request.IsMutation.ShouldBe(isMutation);
    }

    [Theory]
    [InlineData("?dryRun=All")]
    [InlineData("?dryRun=All&fieldManager=fleetconsole")]
    public void DryRun_IsStillAMutation(string query)
    {
        var request = Create("PATCH", Named, query);

        request.IsMutation.ShouldBeTrue();
        request.DryRun.ShouldBe("All");
    }

    [Fact]
    public void WebSocketUpgradeOnExec_IsAStreamingMutation()
    {
        var request = Create("GET", Exec, "?command=sh&stdin=true&tty=true", isUpgrade: true);

        request.Verb.ShouldBe(KubernetesVerb.Connect);
        request.IsMutation.ShouldBeTrue();
        request.IsStreaming.ShouldBeTrue();
        request.IsWatch.ShouldBeFalse();
    }

    [Fact]
    public void EncodedExecWithUpgrade_IsAStreamingMutation()
    {
        var request = Create("GET", "/api/v1/namespaces/shop/pods/b/%65xec", "?command=sh", isUpgrade: true);

        request.Verb.ShouldBe(KubernetesVerb.Connect);
        request.IsMutation.ShouldBeTrue();
        request.IsStreaming.ShouldBeTrue();
        request.Path.Value.ShouldBe("/api/v1/namespaces/shop/pods/b/%65xec");
    }

    [Fact]
    public void FollowedLog_IsStreamingButNotAMutation()
    {
        var request = Create("GET", "/api/v1/namespaces/shop/pods/web-1/log", "?container=app&follow=true");

        request.IsStreaming.ShouldBeTrue();
        request.IsMutation.ShouldBeFalse();
        request.IsWatch.ShouldBeFalse();
    }

    [Theory]
    [InlineData(Collection, "?watch=true", true, KubernetesVerb.Watch)]
    [InlineData(Collection, "?watch=1", true, KubernetesVerb.Watch)]
    [InlineData(Collection, "?labelSelector=a&watch=True", true, KubernetesVerb.Watch)]
    [InlineData(Named, "?watch=true", true, KubernetesVerb.Watch)]
    [InlineData("/api/v1/watch/namespaces/shop/pods", "", true, KubernetesVerb.Watch)]
    [InlineData(Collection, "?watch=false", false, KubernetesVerb.List)]
    [InlineData(Collection, "?watch=yes", false, KubernetesVerb.List)]
    [InlineData(Collection, "?watch=", false, KubernetesVerb.List)]
    [InlineData(Collection, "?watch=false&watch=true", false, KubernetesVerb.List)] // first value wins, as upstream
    [InlineData(Collection, "", false, KubernetesVerb.List)]
    // keys are case-sensitive and malformed/';' pairs are ignored, like Go's url.ParseQuery (review round 1, finding 3)
    [InlineData(Collection, "?Watch=0&watch=1", true, KubernetesVerb.Watch)]
    [InlineData(Collection, "?WATCH=1", false, KubernetesVerb.List)]
    [InlineData(Collection, "?Watch=true", false, KubernetesVerb.List)]
    [InlineData(Collection, "?w%61tch=1", true, KubernetesVerb.Watch)]
    [InlineData(Collection, "?watch=%zz&watch=1", true, KubernetesVerb.Watch)]
    [InlineData(Collection, "?watch=1;x=y", false, KubernetesVerb.List)]
    [InlineData(Collection, "?watch=false;&watch=1", true, KubernetesVerb.Watch)]
    public void Detects_Watches(string path, string query, bool isWatch, KubernetesVerb verb)
    {
        var request = Create("GET", path, query);

        request.IsWatch.ShouldBe(isWatch);
        request.IsStreaming.ShouldBe(isWatch);
        request.IsMutation.ShouldBeFalse();
        request.Verb.ShouldBe(verb);
    }

    [Fact]
    public void Carries_RawInputsAndDecodedAuditFields()
    {
        ProxyPath.TryParse(Named, out var path).ShouldBeTrue();

        var request = ProxyRequest.Create(
            "PATCH", path, "?fieldManager=kube%20ctl&fieldManager=other&dryRun=All", isUpgrade: false, contentLength: 42);

        request.Method.ShouldBe("PATCH");
        request.Path.ShouldBe(path);
        request.QueryString.ShouldBe("?fieldManager=kube%20ctl&fieldManager=other&dryRun=All");
        request.Info.ShouldBe(KubernetesRequestInfo.Parse(path));
        request.ContentLength.ShouldBe(42);
        request.FieldManager.ShouldBe("kube ctl");
        request.DryRun.ShouldBe("All");
        request.IsStreaming.ShouldBeFalse();
    }

    [Theory]
    [InlineData("?Follow=true", false)]
    [InlineData("?FOLLOW=1", false)]
    [InlineData("?Follow=false&follow=1", true)]
    [InlineData("?follow=t", true)]
    public void Follow_KeyIsCaseSensitive(string query, bool isStreaming) =>
        Create("GET", "/api/v1/namespaces/shop/pods/web-1/log", query).IsStreaming.ShouldBe(isStreaming);

    [Theory]
    [InlineData("?DryRun=All&FieldManager=x", null, null)]
    [InlineData("?dryrun=All&fieldmanager=x", null, null)]
    [InlineData("?DryRun=x&dryRun=All&fieldManager=a+b%2Bc", "All", "a b+c")]
    [InlineData("?dryRun=%zz&dryRun=All", "All", null)]
    public void AuditFields_KeysAreCaseSensitive(string query, string? dryRun, string? fieldManager)
    {
        var request = Create("PATCH", Named, query);

        request.DryRun.ShouldBe(dryRun);
        request.FieldManager.ShouldBe(fieldManager);
    }

    [Fact]
    public void AuditFields_AreNullWhenAbsent()
    {
        var request = Create("GET", Named);

        request.DryRun.ShouldBeNull();
        request.FieldManager.ShouldBeNull();
        request.ContentLength.ShouldBeNull();
    }

    [Fact]
    public void Create_RejectsQueryWithoutQuestionMark()
    {
        ProxyPath.TryParse(Named, out var path).ShouldBeTrue();

        Should.Throw<ArgumentException>(() => ProxyRequest.Create("GET", path, "watch=true", false, null));
    }

    // ---- PRX-8: watch timeout cap ------------------------------------------------------------------------------------

    [Theory]
    [InlineData("?watch=true&timeoutSeconds=600", "?watch=true&timeoutSeconds=300")]
    [InlineData("?watch=true&timeoutSeconds=60", "?watch=true&timeoutSeconds=60")]
    [InlineData("?watch=true&timeoutSeconds=300", "?watch=true&timeoutSeconds=300")]
    [InlineData("?watch=true", "?watch=true&timeoutSeconds=300")]
    [InlineData("?watch=true&timeoutSeconds=abc", "?watch=true&timeoutSeconds=300")]
    [InlineData("?watch=true&timeoutSeconds=", "?watch=true&timeoutSeconds=300")]
    [InlineData("?watch=true&timeoutSeconds", "?watch=true&timeoutSeconds=300")]
    [InlineData("?watch=true&timeoutSeconds=0", "?watch=true&timeoutSeconds=300")]
    [InlineData("?watch=true&timeoutSeconds=-5", "?watch=true&timeoutSeconds=300")]
    [InlineData("?watch=true&timeoutSeconds=99999999999999999999", "?watch=true&timeoutSeconds=300")]
    [InlineData("?timeoutSeconds=60&watch=1&timeoutSeconds=9000", "?timeoutSeconds=60&watch=1")]
    [InlineData("?timeout%53econds=900&watch=true", "?timeoutSeconds=300&watch=true")]
    [InlineData("?watch=1&TimeoutSeconds=9000", "?watch=1&TimeoutSeconds=9000&timeoutSeconds=300")]
    [InlineData("?Watch=0&watch=1&timeoutSeconds=9000", "?Watch=0&watch=1&timeoutSeconds=300")]
    [InlineData("?watch=1&timeoutSeconds=%zz", "?watch=1&timeoutSeconds=%zz&timeoutSeconds=300")]
    [InlineData("?watch=1&timeoutSeconds=60;x", "?watch=1&timeoutSeconds=60;x&timeoutSeconds=300")]
    [InlineData(
        "?labelSelector=app%3Dweb%2Ctier+in+(a)&watch=true&resourceVersion=12&allowWatchBookmarks=true",
        "?labelSelector=app%3Dweb%2Ctier+in+(a)&watch=true&resourceVersion=12&allowWatchBookmarks=true&timeoutSeconds=300")]
    public void ForwardedQueryString_CapsWatchTimeout(string query, string expected) =>
        Create("GET", Collection, query).ForwardedQueryString(300).ShouldBe(expected);

    [Theory]
    [InlineData("")]
    [InlineData("?")]
    public void ForwardedQueryString_AddsTimeoutToLegacyWatchWithoutQuery(string query) =>
        Create("GET", "/api/v1/watch/namespaces/shop/pods", query).ForwardedQueryString(300)
            .ShouldBe("?timeoutSeconds=300");

    [Theory]
    [InlineData("")]
    [InlineData("?timeoutSeconds=9000")]
    [InlineData("?labelSelector=app%3Dweb&limit=500")]
    [InlineData("?follow=true&container=a%2Fb")]
    public void ForwardedQueryString_LeavesNonWatchQueriesUntouched(string query) =>
        Create("GET", Collection, query).ForwardedQueryString(300).ShouldBe(query);

    [Fact]
    public void ForwardedQueryString_RejectsNonPositiveCap() =>
        Should.Throw<ArgumentOutOfRangeException>(() => Create("GET", Collection, "?watch=true").ForwardedQueryString(0));

    private static ProxyRequest Create(string method, string path, string query = "", bool isUpgrade = false)
    {
        ProxyPath.TryParse(path, out var proxyPath).ShouldBeTrue();
        return ProxyRequest.Create(method, proxyPath, query, isUpgrade, contentLength: null);
    }
}
