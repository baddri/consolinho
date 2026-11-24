using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using FleetConsole.DevOAuth.Configuration;
using FleetConsole.DevOAuth.OAuth;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace FleetConsole.DevOAuth.Endpoints;

/// <summary>
/// <c>GET /apis/user.openshift.io/v1/groups</c>: the host API server's group list, which the Api reads with its host SA
/// token (ADR-0039). Groups come from <see cref="DevGroupMembership"/> (no virtual groups); only
/// <c>DevOAuth:GroupsReaderToken</c> may list them.
/// </summary>
/// <remarks>
/// Paging like Kubernetes: <c>limit</c> caps the page, <c>metadata.continue</c> is set when more remain and is passed
/// back as <c>continue</c>. The emulator's token is simply the offset of the next item (no consistency snapshot).
/// </remarks>
internal static class GroupsEndpoint
{
    /// <summary>Lists the groups for the reader token.</summary>
    /// <param name="request">The current request (reads <c>Authorization: Bearer ...</c>).</param>
    /// <param name="membership">The current membership.</param>
    /// <param name="options">Holds the reader token.</param>
    /// <param name="limit">Optional page size (&gt; 0).</param>
    /// <param name="continueToken">Optional paging token from a previous page.</param>
    /// <returns>200 <c>GroupList</c>, 401 for a missing/wrong token, 400 for a bad <c>limit</c>/<c>continue</c>.</returns>
    public static IResult Handle(
        HttpRequest request,
        DevGroupMembership membership,
        IOptions<DevOAuthOptions> options,
        int? limit,
        [Microsoft.AspNetCore.Mvc.FromQuery(Name = "continue")] string? continueToken)
    {
        if (!IsReader(request, options.Value.GroupsReaderToken))
        {
            return Failure(StatusCodes.Status401Unauthorized, "Unauthorized", "Unauthorized");
        }

        var offset = 0;
        if (!string.IsNullOrEmpty(continueToken)
            && !int.TryParse(continueToken, NumberStyles.None, CultureInfo.InvariantCulture, out offset))
        {
            return Failure(StatusCodes.Status400BadRequest, "BadRequest", "invalid continue token");
        }

        if (limit is <= 0)
        {
            return Failure(StatusCodes.Status400BadRequest, "BadRequest", "limit must be positive");
        }

        var all = membership.Groups();
        var page = all.Skip(offset).Take(limit ?? int.MaxValue).ToList();
        var next = offset + page.Count;
        return TypedResults.Ok(new GroupList(
            "GroupList",
            "user.openshift.io/v1",
            new ListMeta("1", next < all.Count ? next.ToString(CultureInfo.InvariantCulture) : null),
            page.Select(group => new Group(new ObjectMeta(group.Name), group.Users)).ToList()));
    }

    /// <summary>Whether the bearer token equals the configured reader token (constant-time compare).</summary>
    private static bool IsReader(HttpRequest request, string? readerToken)
    {
        if (string.IsNullOrEmpty(readerToken)
            || !AuthenticationHeaderValue.TryParse(request.Headers.Authorization, out var header)
            || !string.Equals(header.Scheme, "Bearer", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrEmpty(header.Parameter))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(header.Parameter), Encoding.UTF8.GetBytes(readerToken));
    }

    /// <summary>A Kubernetes failure <c>Status</c>.</summary>
    private static JsonHttpResult<CurrentUserEndpoint.KubernetesStatus> Failure(int code, string reason, string message) =>
        TypedResults.Json(
            new CurrentUserEndpoint.KubernetesStatus("Status", "v1", new Dictionary<string, string>(), "Failure", message, reason, code),
            statusCode: code);

    /// <summary>The <c>user.openshift.io/v1</c> <c>GroupList</c>.</summary>
    internal sealed record GroupList(
        [property: JsonPropertyName("kind")] string Kind,
        [property: JsonPropertyName("apiVersion")] string ApiVersion,
        [property: JsonPropertyName("metadata")] ListMeta Metadata,
        [property: JsonPropertyName("items")] IReadOnlyList<Group> Items);

    /// <summary>List metadata; <c>continue</c> is omitted on the last page.</summary>
    internal sealed record ListMeta(
        [property: JsonPropertyName("resourceVersion")] string ResourceVersion,
        [property: JsonPropertyName("continue"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Continue);

    /// <summary>A <c>Group</c>: name and member usernames.</summary>
    internal sealed record Group(
        [property: JsonPropertyName("metadata")] ObjectMeta Metadata,
        [property: JsonPropertyName("users")] IReadOnlyList<string> Users);

    /// <summary>The object name.</summary>
    internal sealed record ObjectMeta([property: JsonPropertyName("name")] string Name);
}
