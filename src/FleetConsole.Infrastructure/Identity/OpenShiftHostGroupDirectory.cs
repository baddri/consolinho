using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Kubernetes;
using FleetConsole.Application.Auth;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FleetConsole.Infrastructure.Identity;

/// <summary>
/// <see cref="IHostGroupDirectory"/> over the host API server (ADR-0039 §1/§2/§5): pages through
/// <c>GET {HostApiServerUrl}/apis/user.openshift.io/v1/groups?limit=500</c> (following <c>metadata.continue</c>) with
/// FleetConsole's host SA token as Bearer, over the <see cref="OpenShiftHostHttpClient.Name"/> client (same TLS trust,
/// no retries, 10 s per request).
/// </summary>
/// <remarks>
/// <para><b>Snapshot.</b> One process-wide listing (singleton), reused while younger than
/// <see cref="HostGroupsOptions.MaxSnapshotAge"/>. Refreshes are single-flight: a <see cref="SemaphoreSlim"/> lets one
/// caller read the host while the others wait, and callers that waited for a refresh get its result (also a failure)
/// instead of starting another.</para>
/// <para><b>Fail-safe off.</b> A failed refresh replaces the snapshot, so the old data is never served again; the next
/// caller that didn't wait on that refresh retries. A refresh that itself outlasts <c>MaxSnapshotAge</c> counts as
/// <see cref="HostGroupsStatus.Unavailable"/>: its first page would already be too old.</para>
/// <para><b>Failure mapping.</b> 401/403 → <see cref="HostGroupsStatus.Forbidden"/>; network/TLS errors, timeouts,
/// any other status, unusable JSON, an unreadable token file or no <c>HostApiServerUrl</c> →
/// <see cref="HostGroupsStatus.Unavailable"/>. Only cancellation of the caller's token throws.</para>
/// <para><b>Secrets and privacy.</b> The token is read from <see cref="HostGroupsOptions.TokenPath"/> on every refresh
/// (projected tokens rotate) into a <see cref="SensitiveString"/> revealed only into the <c>Authorization</c> header.
/// Logs name the host, the status and a failure reason, once per status transition; never the token, group names or
/// users.</para>
/// </remarks>
internal sealed partial class OpenShiftHostGroupDirectory(
    IHttpClientFactory httpClientFactory,
    IOptions<OpenShiftHostOptions> hostOptions,
    IOptions<HostGroupsOptions> options,
    IClock clock,
    ILogger<OpenShiftHostGroupDirectory> logger) : IHostGroupDirectory, IDisposable
{
    /// <summary>Path of the group list, relative to the API server URL.</summary>
    internal const string GroupsPath = "apis/user.openshift.io/v1/groups";

    /// <summary>Page size (<c>limit</c>) of each list request.</summary>
    internal const int PageSize = 500;

    /// <summary>Guard against a host that keeps returning a <c>continue</c> token (500 × 1000 groups is far beyond any host).</summary>
    internal const int MaxPages = 1000;

    private readonly SemaphoreSlim _refreshGate = new(1, 1);

    // Written only under _refreshGate; read without it on the fast path (hence volatile).
    private volatile HostGroupListing? _snapshot;

    // Incremented (under the gate) after every completed refresh, so waiters can tell that one finished meanwhile.
    private long _refreshes;

    // Status last logged; touched only under the gate. Null until the first refresh.
    private HostGroupsStatus? _loggedStatus;

    /// <inheritdoc />
    public async Task<HostGroupListing> GetAsync(CancellationToken cancellationToken)
    {
        var refreshesSeen = Interlocked.Read(ref _refreshes);
        if (_snapshot is { } current && IsFresh(current))
        {
            return current;
        }

        await _refreshGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var last = _snapshot;
            if (last is not null && (IsFresh(last) || (last.Status != HostGroupsStatus.Ok && Interlocked.Read(ref _refreshes) != refreshesSeen)))
            {
                // Either someone refreshed successfully while we waited, or the refresh we waited for failed: share it
                // rather than hammering a failing host with every queued caller.
                return last;
            }

            var outcome = await RefreshAsync(cancellationToken).ConfigureAwait(false);
            _snapshot = outcome.Listing;
            Interlocked.Increment(ref _refreshes);
            LogTransition(outcome);
            return outcome.Listing;
        }
        finally
        {
            _refreshGate.Release();
        }
    }

    /// <inheritdoc />
    public void Dispose() => _refreshGate.Dispose();

    /// <summary>An Ok listing younger than <c>MaxSnapshotAge</c>; a clock that went backwards counts as stale.</summary>
    private bool IsFresh(HostGroupListing listing)
    {
        if (listing is not { Status: HostGroupsStatus.Ok, ReadAt: { } readAt })
        {
            return false;
        }

        var age = clock.UtcNow - readAt;
        return age >= TimeSpan.Zero && age < options.Value.MaxSnapshotAge;
    }

    /// <summary>Reads every page from the host; never throws except for cancellation of <paramref name="cancellationToken"/>.</summary>
    private async Task<RefreshOutcome> RefreshAsync(CancellationToken cancellationToken)
    {
        var startedAt = clock.UtcNow;
        if (hostOptions.Value.HostApiServerUrl is not { } baseUri)
        {
            return RefreshOutcome.Failed(HostGroupsStatus.Unavailable, null, "not configured");
        }

        var host = baseUri.Host;
        var token = await ReadTokenAsync(cancellationToken).ConfigureAwait(false);
        if (token is null)
        {
            return RefreshOutcome.Failed(HostGroupsStatus.Unavailable, host, "host ServiceAccount token unreadable");
        }

        var client = httpClientFactory.CreateClient(OpenShiftHostHttpClient.Name);
        var groups = new List<HostGroup>();
        string? continueToken = null;
        for (var page = 0; ; page++)
        {
            if (page == MaxPages)
            {
                return RefreshOutcome.Failed(HostGroupsStatus.Unavailable, host, "too many pages");
            }

            var query = continueToken is null
                ? $"?limit={PageSize}"
                : $"?limit={PageSize}&continue={Uri.EscapeDataString(continueToken)}";
            var (list, failure) = await ReadPageAsync(client, HostUri.Resolve(baseUri, GroupsPath + query), token, cancellationToken)
                .ConfigureAwait(false);
            if (failure is not null)
            {
                return failure.Value;
            }

            groups.AddRange(ToHostGroups(list!.Items));
            continueToken = list.Metadata?.Continue;
            if (string.IsNullOrEmpty(continueToken))
            {
                break;
            }
        }

        if (clock.UtcNow - startedAt >= options.Value.MaxSnapshotAge)
        {
            return RefreshOutcome.Failed(HostGroupsStatus.Unavailable, host, "listing took longer than MaxSnapshotAge");
        }

        var listing = new HostGroupListing(
            HostGroupsStatus.Ok,
            startedAt,
            groups.DistinctBy(group => group.Name, StringComparer.Ordinal).OrderBy(group => group.Name, StringComparer.Ordinal).ToList());
        return new RefreshOutcome(listing, host, null);

        // One request; a failure is returned as the outcome of the whole refresh.
        async Task<(GroupList? List, RefreshOutcome? Failure)> ReadPageAsync(
            HttpClient httpClient, Uri uri, SensitiveString bearer, CancellationToken ct)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer.Reveal());
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            try
            {
                // Default completion (body buffered inside SendAsync), so the client timeout also covers the body.
                using var response = await httpClient.SendAsync(request, ct).ConfigureAwait(false);
                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                {
                    return (null, RefreshOutcome.Failed(HostGroupsStatus.Forbidden, host, $"HTTP {(int)response.StatusCode}"));
                }

                if (!response.IsSuccessStatusCode)
                {
                    return (null, RefreshOutcome.Failed(HostGroupsStatus.Unavailable, host, $"HTTP {(int)response.StatusCode}"));
                }

                var list = await response.Content.ReadFromJsonAsync<GroupList>(ct).ConfigureAwait(false);
                return list is null
                    ? (null, RefreshOutcome.Failed(HostGroupsStatus.Unavailable, host, "empty body"))
                    : (list, null);
            }
            catch (Exception exception) when (exception is HttpRequestException or JsonException or NotSupportedException
                                                  || (exception is TaskCanceledException && !ct.IsCancellationRequested))
            {
                // HttpRequestException: DNS, connection, TLS, body read. TaskCanceledException without our token: the
                // client timeout. JsonException/NotSupportedException: not a GroupList.
                return (null, RefreshOutcome.Failed(HostGroupsStatus.Unavailable, host, exception.GetType().Name));
            }
        }
    }

    /// <summary>
    /// The inline Development token if set, otherwise the trimmed content of the token file (re-read every time);
    /// <see langword="null"/> when there is none.
    /// </summary>
    private async Task<SensitiveString?> ReadTokenAsync(CancellationToken cancellationToken)
    {
        var configured = options.Value;
        if (!string.IsNullOrEmpty(configured.Token))
        {
            return new SensitiveString(configured.Token);
        }

        string content;
        try
        {
            content = await File.ReadAllTextAsync(configured.TokenPath, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException)
        {
            // Missing mount, permissions, or an unusable path: no token, so the listing is unavailable.
            return null;
        }

        var trimmed = content.Trim();
        return trimmed.Length == 0 ? null : new SensitiveString(trimmed);
    }

    /// <summary>Maps list items to <see cref="HostGroup"/>s: nameless and virtual <c>system:*</c> groups dropped, null users → empty.</summary>
    private static IEnumerable<HostGroup> ToHostGroups(IReadOnlyList<Group?>? items) =>
        (items ?? [])
            .Where(item => item?.Metadata?.Name is { Length: > 0 } name && !OpenShiftGroups.IsVirtual(name))
            .Select(item => new HostGroup(
                item!.Metadata!.Name!,
                (item.Users ?? []).Where(user => !string.IsNullOrEmpty(user)).Select(user => user!).Distinct(StringComparer.Ordinal).ToList()));

    /// <summary>Logs when the status differs from the last logged one (first refresh included).</summary>
    private void LogTransition(RefreshOutcome outcome)
    {
        var status = outcome.Listing.Status;
        if (_loggedStatus == status)
        {
            return;
        }

        _loggedStatus = status;
        var host = outcome.Host ?? "(not configured)";
        if (status == HostGroupsStatus.Ok)
        {
            Log.Readable(logger, host, outcome.Listing.Groups.Count);
        }
        else
        {
            Log.NotReadable(logger, host, status, outcome.Reason ?? "unknown");
        }
    }

    /// <summary>The result of one refresh plus what to log about it.</summary>
    /// <param name="Listing">The new snapshot.</param>
    /// <param name="Host">The host name, for logs; null when not configured.</param>
    /// <param name="Reason">Why the refresh failed (status code or error type); null on success.</param>
    private readonly record struct RefreshOutcome(HostGroupListing Listing, string? Host, string? Reason)
    {
        public static RefreshOutcome Failed(HostGroupsStatus status, string? host, string reason) =>
            new(HostGroupListing.Failed(status), host, reason);
    }

    /// <summary>The subset of <c>user.openshift.io/v1 GroupList</c> FleetConsole reads.</summary>
    private sealed record GroupList(
        [property: JsonPropertyName("metadata")] ListMeta? Metadata,
        [property: JsonPropertyName("items")] IReadOnlyList<Group?>? Items);

    /// <summary>List metadata: the paging token.</summary>
    private sealed record ListMeta([property: JsonPropertyName("continue")] string? Continue);

    /// <summary>A <c>Group</c>: its name and members (<c>users</c> is null on OpenShift for a group without members).</summary>
    private sealed record Group(
        [property: JsonPropertyName("metadata")] ObjectMeta? Metadata,
        [property: JsonPropertyName("users")] IReadOnlyList<string?>? Users);

    /// <summary>The object name.</summary>
    private sealed record ObjectMeta([property: JsonPropertyName("name")] string? Name);

    /// <summary>Source-generated log messages (no tokens, no group names, no users).</summary>
    private static partial class Log
    {
        [LoggerMessage(EventId = 3320, Level = LogLevel.Information,
            Message = "Host groups on host API server {Host} are readable ({GroupCount} groups)")]
        public static partial void Readable(ILogger logger, string host, int groupCount);

        [LoggerMessage(EventId = 3321, Level = LogLevel.Warning,
            Message = "Host groups on host API server {Host} are {Status} ({Reason}); no group listing is served until a refresh succeeds")]
        public static partial void NotReadable(ILogger logger, string host, HostGroupsStatus status, string reason);
    }
}
