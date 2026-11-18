using System.Text.RegularExpressions;
using FleetConsole.Domain.Common;

namespace FleetConsole.Domain.Audit;

/// <summary>
/// One immutable record of something that happened in FleetConsole (AUD-1): who did what to which object, when, and in
/// which request. Entries are written in the same transaction as the change they describe (ADR-0008), are never
/// changed or deleted (AUD-3) and are read by the audit-log query (contract §10).
/// </summary>
/// <remarks>
/// Append-only by construction: the only way to obtain an entry is <see cref="Record"/>, and there are no behaviour
/// methods. Names (actor, target, cluster) are copied as they were at the time so entries stay meaningful after the
/// referenced objects are renamed or deleted. Entries are composed by the Application's <c>IAuditTrail</c>, never by
/// handlers directly.
/// </remarks>
public sealed partial class AuditEntry : AggregateRoot<AuditEntryId>
{
    /// <summary>Parameterless constructor for EF Core materialization only.</summary>
    private AuditEntry()
    {
    }

    private AuditEntry(AuditEntryId id)
        : base(id)
    {
    }

    /// <summary>Who performed the action.</summary>
    public AuditActor Actor { get; private init; } = null!;

    /// <summary>What happened, as <c>&lt;area&gt;.&lt;verb&gt;</c> (e.g. <c>user.deactivated</c>); see contract §10.</summary>
    public string Action { get; private init; } = null!;

    /// <summary>Filter category, derived from the prefix of <see cref="Action"/>.</summary>
    public AuditCategory Category { get; private init; }

    /// <summary>The kind of object the entry is about.</summary>
    public AuditTargetType TargetType { get; private init; }

    /// <summary>Identifier of the target (a GUID or a name), informational; <see langword="null"/> when there is none.</summary>
    public string? TargetId { get; private init; }

    /// <summary>Display name of the target at the time of the action (e.g. <c>alice</c>, <c>alice → prod-eu-1</c>).</summary>
    public string TargetName { get; private init; } = null!;

    /// <summary>Name of the cluster the action concerns, when it concerns one (clusters, credentials, grants).</summary>
    public string? ClusterName { get; private init; }

    /// <summary>
    /// The username of the user the action is about besides the actor, if any: the target user of <c>user.*</c>
    /// entries, the granted user of <c>grant.*</c> entries. Lets the audit log's <c>user</c> filter match entries where
    /// the user is the actor, the target, or the user of a target grant (contract §10). <see langword="null"/> when
    /// the action concerns no particular user.
    /// </summary>
    public string? RelatedUsername { get; private init; }

    /// <summary>One human-readable sentence describing the action.</summary>
    public string Summary { get; private init; } = null!;

    /// <summary>W3C trace id of the request that caused the action, to correlate with logs and traces.</summary>
    public string? CorrelationId { get; private init; }

    /// <summary>Action-specific structured data as a JSON object string (shapes per action in contract §10). Never secrets.</summary>
    public string DetailsJson { get; private init; } = null!;

    /// <summary>When the action happened.</summary>
    public DateTimeOffset OccurredAt { get; private init; }

    /// <summary>
    /// Creates an audit entry. Arguments come from code (event-to-entry mappings), not from user input, so invalid values
    /// are programming errors and throw.
    /// </summary>
    /// <param name="actor">Who performed the action.</param>
    /// <param name="action">Action name matching <c>^[a-z]+\.[a-z_]+$</c> with a known area prefix
    /// (<c>auth</c>, <c>user</c>, <c>cluster</c>, <c>credential</c>, <c>grant</c>).</param>
    /// <param name="targetType">The kind of target.</param>
    /// <param name="targetId">Target identifier, if any.</param>
    /// <param name="targetName">Target display name.</param>
    /// <param name="clusterName">Cluster name, if the action concerns a cluster.</param>
    /// <param name="summary">Human-readable sentence.</param>
    /// <param name="correlationId">Trace id of the current request, if any.</param>
    /// <param name="detailsJson">Serialized JSON object (<c>{}</c> when there are no details).</param>
    /// <param name="occurredAt">When it happened (from <c>IClock</c>).</param>
    /// <param name="relatedUsername">The user the action is about, if any (see <see cref="RelatedUsername"/>); blank is
    /// stored as <see langword="null"/>.</param>
    /// <returns>The new entry.</returns>
    /// <exception cref="ArgumentException">When the action is malformed or has an unknown prefix, the details are not a
    /// JSON object, or a required value is missing.</exception>
    public static AuditEntry Record(
        AuditActor actor,
        string action,
        AuditTargetType targetType,
        string? targetId,
        string targetName,
        string? clusterName,
        string summary,
        string? correlationId,
        string detailsJson,
        DateTimeOffset occurredAt,
        string? relatedUsername = null)
    {
        Guard.NotNull(actor);
        Guard.NotNullOrWhiteSpace(targetName);
        Guard.NotNullOrWhiteSpace(summary);
        Guard.NotDefault(occurredAt);
        if (!Enum.IsDefined(targetType))
        {
            throw new ArgumentOutOfRangeException(nameof(targetType), targetType, "Unknown audit target type.");
        }

        return new AuditEntry(AuditEntryId.New())
        {
            Actor = actor,
            Action = action,
            Category = CategoryOf(action),
            TargetType = targetType,
            TargetId = targetId,
            TargetName = targetName,
            ClusterName = clusterName,
            RelatedUsername = string.IsNullOrWhiteSpace(relatedUsername) ? null : relatedUsername,
            Summary = summary,
            CorrelationId = correlationId,
            DetailsJson = EnsureJsonObject(detailsJson),
            OccurredAt = occurredAt,
        };
    }

    /// <summary>Validates the action format and maps its prefix to the filter category.</summary>
    private static AuditCategory CategoryOf(string action)
    {
        Guard.NotNull(action);
        if (!ActionPattern().IsMatch(action))
        {
            throw new ArgumentException($"Audit action '{action}' must match '<area>.<verb>' in lower case.", nameof(action));
        }

        return action[..action.IndexOf('.', StringComparison.Ordinal)] switch
        {
            "auth" => AuditCategory.Auth,
            "user" => AuditCategory.Users,
            "cluster" => AuditCategory.Clusters,
            "credential" => AuditCategory.Credentials,
            "grant" => AuditCategory.Grants,
            _ => throw new ArgumentException($"Audit action '{action}' has an unknown area prefix.", nameof(action)),
        };
    }

    /// <summary>
    /// Cheap structural check that the details are a JSON object. The Domain does not parse JSON; the Application
    /// serializes details with System.Text.Json, so this only catches callers passing something that is clearly not an
    /// object (an array, a scalar, an empty string).
    /// </summary>
    private static string EnsureJsonObject(string detailsJson)
    {
        Guard.NotNull(detailsJson);
        var trimmed = detailsJson.AsSpan().Trim();
        if (trimmed.Length < 2 || trimmed[0] != '{' || trimmed[^1] != '}')
        {
            throw new ArgumentException("Audit details must be a JSON object.", nameof(detailsJson));
        }

        return detailsJson;
    }

    // '\z' instead of '$': in .NET '$' also matches before a trailing newline, which would let "user.created\n" through.
    [GeneratedRegex(@"^[a-z]+\.[a-z_]+\z", RegexOptions.CultureInvariant)]
    private static partial Regex ActionPattern();
}
