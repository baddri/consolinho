using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using Microsoft.Extensions.Logging;

namespace FleetConsole.Infrastructure.Kubernetes;

/// <summary>
/// One probe session (see <see cref="IClusterProbeSession"/>): an <see cref="HttpClient"/> over the session's own TLS
/// handler, the bearer token, and the translation of every outcome into <see cref="ProbeResponse{T}"/>.
/// </summary>
/// <remarks>
/// <para><b>Secrets:</b> the token is revealed only to set the <c>Authorization</c> header of each request. Response
/// bodies are parsed into small DTOs and never logged or echoed in failure messages.</para>
/// <para><b>Failure mapping:</b> 401/403/404 → Unauthorized/Forbidden/NotFound, other non-2xx → UnexpectedStatus;
/// name resolution → DnsFailure; refused/unreachable → ConnectionRefused; TLS handshake → the kind recorded by the
/// handler's <see cref="TlsValidationRecord"/>; the per-request timeout → Timeout; unparsable or oversized bodies →
/// InvalidResponse. Cancellation of the caller's token propagates as <see cref="OperationCanceledException"/>.</para>
/// </remarks>
internal sealed partial class ClusterProbeSession : IClusterProbeSession
{
    /// <summary>Upper bound for a buffered response body; real answers are a few KiB.</summary>
    private const int MaxResponseBytes = 4 * 1024 * 1024;

    private const string SelfSubjectReviewsPath = "apis/authentication.k8s.io/v1/selfsubjectreviews";
    private const string ClusterVersionPath = "apis/config.openshift.io/v1/clusterversions/version";
    private const string AccessReviewsPath = "apis/authorization.k8s.io/v1/selfsubjectaccessreviews";
    private const string RulesReviewsPath = "apis/authorization.k8s.io/v1/selfsubjectrulesreviews";

    private readonly HttpClient? _client;
    private readonly ClusterTlsHandler? _tlsHandler;
    private readonly SensitiveString? _token;
    private readonly ProbeFailure? _configurationFailure;
    private readonly string _host;
    private readonly ILogger _logger;

    private ClusterProbeSession(
        HttpClient? client, ClusterTlsHandler? tlsHandler, SensitiveString? token, ProbeFailure? configurationFailure,
        string host, ILogger logger)
    {
        _client = client;
        _tlsHandler = tlsHandler;
        _token = token;
        _configurationFailure = configurationFailure;
        _host = host;
        _logger = logger;
    }

    /// <summary>Creates a working session over <paramref name="tlsHandler"/>, which the session then owns.</summary>
    /// <param name="connection">The cluster's API URL (relative request paths resolve against it).</param>
    /// <param name="token">The bearer token.</param>
    /// <param name="tlsHandler">The session's handler.</param>
    /// <param name="requestTimeout">Per-request timeout.</param>
    /// <param name="logger">Failure logger.</param>
    /// <returns>The session.</returns>
    public static ClusterProbeSession Create(
        ClusterConnection connection, SensitiveString token, ClusterTlsHandler tlsHandler, TimeSpan requestTimeout, ILogger logger)
    {
        var client = new HttpClient(tlsHandler.Handler, disposeHandler: false)
        {
            BaseAddress = WithTrailingSlash(connection.ApiUrl),
            Timeout = requestTimeout,
            MaxResponseContentBufferSize = MaxResponseBytes,
        };
        return new ClusterProbeSession(client, tlsHandler, token, configurationFailure: null, connection.ApiUrl.Host, logger);
    }

    /// <summary>Creates a session whose every call fails with <paramref name="failure"/> (unusable configuration).</summary>
    /// <param name="connection">The cluster, for log context.</param>
    /// <param name="failure">The failure to return.</param>
    /// <param name="logger">Failure logger.</param>
    /// <returns>The session.</returns>
    public static ClusterProbeSession Failed(ClusterConnection connection, ProbeFailure failure, ILogger logger) =>
        new(client: null, tlsHandler: null, token: null, failure, connection.ApiUrl.Host, logger);

    /// <inheritdoc />
    public Task<ProbeResponse<KubernetesVersionInfo>> GetVersionAsync(CancellationToken cancellationToken) =>
        SendAsync<VersionDto, KubernetesVersionInfo>(
            HttpMethod.Get, "version", body: null,
            dto => string.IsNullOrEmpty(dto.GitVersion) ? null : new KubernetesVersionInfo(dto.GitVersion),
            cancellationToken);

    /// <inheritdoc />
    public Task<ProbeResponse<SelfSubjectReviewInfo>> GetSelfSubjectReviewAsync(CancellationToken cancellationToken) =>
        SendAsync<SelfSubjectReviewDto, SelfSubjectReviewInfo>(
            HttpMethod.Post, SelfSubjectReviewsPath,
            new ReviewRequestDto("authentication.k8s.io/v1", "SelfSubjectReview", Spec: null),
            dto => dto.Status?.UserInfo is { Username: { Length: > 0 } username } userInfo
                ? new SelfSubjectReviewInfo(username, userInfo.Groups ?? [])
                : null,
            cancellationToken);

    /// <inheritdoc />
    public Task<ProbeResponse<ServedApiGroups>> GetServedApiGroupsAsync(CancellationToken cancellationToken) =>
        SendAsync<ApiGroupListDto, ServedApiGroups>(
            HttpMethod.Get, "apis", body: null,
            // Missing or empty groups is a valid (if odd) discovery answer: nothing served, not a parse failure.
            dto => new ServedApiGroups(
                (dto.Groups ?? [])
                    .Select(g => g?.Name)
                    .OfType<string>()
                    .Where(name => name.Length > 0)
                    .ToHashSet(StringComparer.Ordinal)),
            cancellationToken);

    /// <inheritdoc />
    public Task<ProbeResponse<ClusterVersionInfo>> GetClusterVersionAsync(CancellationToken cancellationToken) =>
        SendAsync<ClusterVersionDto, ClusterVersionInfo>(
            HttpMethod.Get, ClusterVersionPath, body: null,
            dto =>
            {
                var version = dto.Status?.Desired?.Version;
                if (string.IsNullOrEmpty(version))
                {
                    return null;
                }

                var progressing = dto.Status!.Conditions?.Any(condition =>
                    string.Equals(condition.Type, "Progressing", StringComparison.Ordinal) &&
                    string.Equals(condition.Status, "True", StringComparison.Ordinal)) ?? false;
                return new ClusterVersionInfo(version, progressing);
            },
            cancellationToken);

    /// <inheritdoc />
    public Task<ProbeResponse<AccessReviewResult>> ReviewAccessAsync(ResourceAttributes attributes, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(attributes);

        var spec = new ReviewSpecDto(
            new ResourceAttributesDto(
                attributes.Verb, attributes.Group, attributes.Resource,
                string.IsNullOrEmpty(attributes.Subresource) ? null : attributes.Subresource,
                string.IsNullOrEmpty(attributes.Namespace) ? null : attributes.Namespace),
            Namespace: null);

        return SendAsync<AccessReviewDto, AccessReviewResult>(
            HttpMethod.Post, AccessReviewsPath,
            new ReviewRequestDto("authorization.k8s.io/v1", "SelfSubjectAccessReview", spec),
            dto => dto.Status is { } status
                ? new AccessReviewResult(status.Allowed, string.IsNullOrEmpty(status.Reason) ? null : status.Reason)
                : null,
            cancellationToken);
    }

    /// <inheritdoc />
    public Task<ProbeResponse<RulesReviewResult>> ReviewRulesAsync(string namespaceName, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(namespaceName);

        return SendAsync<RulesReviewDto, RulesReviewResult>(
            HttpMethod.Post, RulesReviewsPath,
            new ReviewRequestDto("authorization.k8s.io/v1", "SelfSubjectRulesReview", new ReviewSpecDto(ResourceAttributes: null, namespaceName)),
            dto => dto.Status is { } status
                ? new RulesReviewResult(
                    status.Incomplete,
                    string.IsNullOrEmpty(status.EvaluationError) ? null : status.EvaluationError,
                    (status.ResourceRules ?? [])
                        .Select(rule => new KubernetesResourceRule(
                            rule.Verbs ?? [], rule.ApiGroups ?? [], rule.Resources ?? [], rule.ResourceNames ?? []))
                        .ToList())
                : null,
            cancellationToken);
    }

    /// <summary>Disposes the HTTP client and the session's TLS handler.</summary>
    /// <returns>A completed task.</returns>
    public ValueTask DisposeAsync()
    {
        _client?.Dispose();
        _tlsHandler?.Dispose();
        return ValueTask.CompletedTask;
    }

    /// <summary>
    /// Sends one request and maps every outcome to a <see cref="ProbeResponse{T}"/>. <paramref name="map"/> returns
    /// <see langword="null"/> when the body parsed but lacks a required field (→ InvalidResponse).
    /// </summary>
    private async Task<ProbeResponse<TResult>> SendAsync<TDto, TResult>(
        HttpMethod method, string relativePath, ReviewRequestDto? body, Func<TDto, TResult?> map, CancellationToken cancellationToken)
        where TDto : class
        where TResult : class
    {
        if (_configurationFailure is not null)
        {
            return ProbeResponse<TResult>.Fail(_configurationFailure);
        }

        ObjectDisposedException.ThrowIf(_client is null || _token is null, this);

        ProbeFailure failure;
        Exception? exception = null;
        try
        {
            using var request = new HttpRequestMessage(method, new Uri(relativePath, UriKind.Relative));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token.Reveal());
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (body is not null)
            {
                request.Content = JsonContent.Create(body, options: KubernetesJson.Options);
            }

            using var response = await _client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
            {
                var dto = await response.Content.ReadFromJsonAsync<TDto>(KubernetesJson.Options, cancellationToken).ConfigureAwait(false);
                var result = dto is null ? null : map(dto);
                if (result is not null)
                {
                    return ProbeResponse<TResult>.Ok(result);
                }

                failure = InvalidResponse();
            }
            else
            {
                failure = FromStatus(response.StatusCode);
            }
        }
        catch (OperationCanceledException caught) when (!cancellationToken.IsCancellationRequested)
        {
            // Not the caller's token, so it is HttpClient.Timeout.
            exception = caught;
            failure = ProbeFailureClassifier.Timeout(_host);
        }
        catch (HttpRequestException caught)
        {
            exception = caught;
            failure = FromHttpRequestException(caught);
        }
        catch (Exception caught) when (caught is JsonException or NotSupportedException)
        {
            // JsonException: malformed or mistyped JSON. NotSupportedException: a non-JSON content type.
            exception = caught;
            failure = InvalidResponse();
        }

        // Only the operation path, the host and the category: never the token, the body or response headers.
        ProbeLog.CallFailed(_logger, method.Method, relativePath, _host, failure.Kind, exception);
        return ProbeResponse<TResult>.Fail(failure);
    }

    private ProbeFailure FromStatus(HttpStatusCode statusCode) => ProbeFailureClassifier.FromStatus(statusCode, _host);

    // The session owns its handler exclusively, so its TLS record identifies this handshake's rejection reason.
    private ProbeFailure FromHttpRequestException(HttpRequestException exception) =>
        ProbeFailureClassifier.FromHttpRequestException(exception, _host, _tlsHandler?.Tls);

    private ProbeFailure InvalidResponse() => ProbeFailureClassifier.InvalidResponse(_host);

    private static Uri WithTrailingSlash(Uri apiUrl) =>
        apiUrl.AbsolutePath.EndsWith('/') ? apiUrl : new Uri(apiUrl.GetLeftPart(UriPartial.Path) + "/");

    /// <summary>Source-generated log messages of the probe.</summary>
    private static partial class ProbeLog
    {
        [LoggerMessage(EventId = 3100, Level = LogLevel.Information,
            Message = "Cluster probe {Method} /{Path} to {Host} failed: {FailureKind}")]
        public static partial void CallFailed(
            ILogger logger, string method, string path, string host, ProbeFailureKind failureKind, Exception? exception);
    }
}
