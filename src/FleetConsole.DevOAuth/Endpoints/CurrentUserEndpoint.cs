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
/// <c>GET /apis/user.openshift.io/v1/users/~</c>: the host API server's "who am I" endpoint, which the Api calls with
/// the fresh access token to learn the username, display name and groups (ADR-0007 "Identity").
/// </summary>
/// <remarks>
/// Shaped like OpenShift's oauth-apiserver response for a persisted user (<c>pkg/user/apiserver/registry/user/etcd</c>):
/// <c>groups</c> is the sorted, de-duplicated list of the request's groups, which on a real cluster always includes the
/// virtual <c>system:authenticated</c> and <c>system:authenticated:oauth</c> groups next to the user's own groups.
/// <c>groups</c> is always present (the Go field has no <c>omitempty</c>); <c>fullName</c> is omitted when empty.
/// </remarks>
internal static class CurrentUserEndpoint
{
    /// <summary>Virtual groups OpenShift adds to every user authenticated with an OAuth access token.</summary>
    private static readonly string[] VirtualGroups = ["system:authenticated", "system:authenticated:oauth"];

    /// <summary>Resolves the bearer token to its user and returns the OpenShift <c>User</c> representation.</summary>
    /// <param name="request">The current request (reads <c>Authorization: Bearer ...</c>).</param>
    /// <param name="store">Looks up the token.</param>
    /// <param name="options">The configured users.</param>
    /// <returns>200 <c>User</c>, or 401 Kubernetes <c>Status</c> for a missing/unknown/expired token.</returns>
    public static IResult Handle(HttpRequest request, DevOAuthStore store, IOptions<DevOAuthOptions> options)
    {
        if (!AuthenticationHeaderValue.TryParse(request.Headers.Authorization, out var header)
            || !string.Equals(header.Scheme, "Bearer", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrEmpty(header.Parameter))
        {
            return Unauthorized();
        }

        var grant = store.FindAccessToken(header.Parameter);

        // A user removed from the configuration after the token was issued no longer exists: treat like a bad token.
        var user = grant is null
            ? null
            : options.Value.Users.FirstOrDefault(u => string.Equals(u.Name, grant.UserName, StringComparison.Ordinal));
        if (user is null)
        {
            return Unauthorized();
        }

        return TypedResults.Ok(new OpenShiftUser(
            Kind: "User",
            ApiVersion: "user.openshift.io/v1",
            Metadata: new ObjectMeta(user.Name, StableUid(user.Name)),
            FullName: string.IsNullOrEmpty(user.FullName) ? null : user.FullName,
            Identities: [$"devoauth:{user.Name}"],
            Groups: user.Groups.Concat(VirtualGroups).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray()));
    }

    /// <summary>
    /// A uid that stays the same across emulator restarts (derived from the username), as a persisted OpenShift user's
    /// uid does across logins.
    /// </summary>
    private static string StableUid(string userName) =>
        new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"devoauth:{userName}")).AsSpan(0, 16)).ToString();

    /// <summary>The Kubernetes API server's response to an unauthenticated request.</summary>
    private static JsonHttpResult<KubernetesStatus> Unauthorized() =>
        TypedResults.Json(
            new KubernetesStatus("Status", "v1", new Dictionary<string, string>(), "Failure", "Unauthorized", "Unauthorized", 401),
            statusCode: StatusCodes.Status401Unauthorized);

    /// <summary>The <c>user.openshift.io/v1</c> <c>User</c> object.</summary>
    internal sealed record OpenShiftUser(
        [property: JsonPropertyName("kind")] string Kind,
        [property: JsonPropertyName("apiVersion")] string ApiVersion,
        [property: JsonPropertyName("metadata")] ObjectMeta Metadata,
        [property: JsonPropertyName("fullName"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? FullName,
        [property: JsonPropertyName("identities")] IReadOnlyList<string> Identities,
        [property: JsonPropertyName("groups")] IReadOnlyList<string> Groups);

    /// <summary>The subset of Kubernetes object metadata the Api reads.</summary>
    internal sealed record ObjectMeta(
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("uid")] string Uid);

    /// <summary>Kubernetes <c>meta/v1 Status</c> (failure form).</summary>
    internal sealed record KubernetesStatus(
        [property: JsonPropertyName("kind")] string Kind,
        [property: JsonPropertyName("apiVersion")] string ApiVersion,
        [property: JsonPropertyName("metadata")] IReadOnlyDictionary<string, string> Metadata,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("message")] string Message,
        [property: JsonPropertyName("reason")] string Reason,
        [property: JsonPropertyName("code")] int Code);
}
