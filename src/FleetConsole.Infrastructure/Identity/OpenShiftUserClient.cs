using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Auth;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// <see cref="IExternalIdentityClient"/> over the host API server: <c>GET {HostApiServerUrl}/apis/user.openshift.io/v1/users/~</c>
/// with the user's access token as Bearer, mapped to <see cref="ExternalIdentity"/> (<c>metadata.name</c>,
/// <c>fullName</c> — omitted by OpenShift when empty — and <c>groups</c>, reported unfiltered).
/// </summary>
/// <remarks>
/// <para>Failure mapping: network/TLS errors, timeouts, 5xx and 401 → <see cref="ExternalIdentityUnavailableException"/>
/// (login "unavailable"); any other status or an unusable body → <see cref="InvalidOperationException"/> (login
/// "failed").</para>
/// <para>The token is revealed only into the <c>Authorization</c> header of the request message. Logs and exception
/// messages contain the status and host, never the token or response body.</para>
/// </remarks>
internal sealed partial class OpenShiftUserClient(
    IHttpClientFactory httpClientFactory,
    IOptions<OpenShiftHostOptions> options,
    ILogger<OpenShiftUserClient> logger) : IExternalIdentityClient
{
    /// <summary>Path of the "who am I" endpoint, relative to the API server URL.</summary>
    internal const string CurrentUserPath = "apis/user.openshift.io/v1/users/~";

    /// <inheritdoc />
    public async Task<ExternalIdentity> GetCurrentUserAsync(SensitiveString accessToken, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(accessToken);
        var uri = HostUri.Resolve(options.Value.HostApiServerUrl!, CurrentUserPath);

        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken.Reveal());
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        var client = httpClientFactory.CreateClient(OpenShiftHostHttpClient.Name);
        HttpResponseMessage response;
        try
        {
            // Default completion (ResponseContentRead) on purpose: the small body is buffered inside SendAsync, so the
            // client timeout covers it and a stalled or broken body surfaces here as a timeout/HttpRequestException
            // ("unavailable") instead of hanging the login callback while reading.
            response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is HttpRequestException
                                              || (exception is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            // HttpRequestException: DNS, connection, TLS, body read. TaskCanceledException without our token: the
            // client timeout.
            Log.Unreachable(logger, uri.Host, exception.GetType().Name);
            throw new ExternalIdentityUnavailableException($"The host API server {uri.Host} could not be reached.", exception);
        }

        using (response)
        {
            if (response.StatusCode == HttpStatusCode.Unauthorized || (int)response.StatusCode >= 500)
            {
                Log.UnexpectedStatus(logger, uri.Host, (int)response.StatusCode);
                throw new ExternalIdentityUnavailableException(
                    $"The host API server {uri.Host} answered users/~ with HTTP {(int)response.StatusCode}.");
            }

            if (!response.IsSuccessStatusCode)
            {
                Log.UnexpectedStatus(logger, uri.Host, (int)response.StatusCode);
                throw new InvalidOperationException(
                    $"The host API server {uri.Host} answered users/~ with unexpected HTTP {(int)response.StatusCode}.");
            }

            OpenShiftUser? user;
            try
            {
                user = await response.Content.ReadFromJsonAsync<OpenShiftUser>(cancellationToken).ConfigureAwait(false);
            }
            catch (JsonException exception)
            {
                throw new InvalidOperationException("The users/~ response is not a valid OpenShift User.", exception);
            }

            if (user?.Metadata?.Name is not { Length: > 0 } name)
            {
                throw new InvalidOperationException("The users/~ response has no metadata.name.");
            }

            return new ExternalIdentity(
                name,
                string.IsNullOrWhiteSpace(user.FullName) ? null : user.FullName,
                user.Groups?.Where(g => g is not null).ToList() ?? []);
        }
    }

    /// <summary>The subset of <c>user.openshift.io/v1 User</c> FleetConsole reads.</summary>
    private sealed record OpenShiftUser(
        [property: JsonPropertyName("metadata")] ObjectMeta? Metadata,
        [property: JsonPropertyName("fullName")] string? FullName,
        [property: JsonPropertyName("groups")] IReadOnlyList<string>? Groups);

    /// <summary>The object name.</summary>
    private sealed record ObjectMeta([property: JsonPropertyName("name")] string? Name);

    /// <summary>Source-generated log messages (no tokens, no bodies).</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 3300, Level = LogLevel.Warning,
            Message = "users/~ on host API server {Host} could not be reached ({ErrorType})")]
        public static partial void Unreachable(ILogger logger, string host, string errorType);

        [LoggerMessage(EventId = 3301, Level = LogLevel.Warning,
            Message = "users/~ on host API server {Host} answered HTTP {StatusCode}")]
        public static partial void UnexpectedStatus(ILogger logger, string host, int statusCode);
    }
}
