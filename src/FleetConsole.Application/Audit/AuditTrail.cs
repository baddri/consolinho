using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Audit;

namespace FleetConsole.Application.Audit;

/// <summary>
/// The <see cref="IAuditTrail"/>: turns an <see cref="AuditRecord"/> into an <see cref="AuditEntry"/> by adding the actor,
/// the time and the correlation id, and stages it through <see cref="IAuditEntryRepository"/> so it is written by the same
/// save as the change it describes (ADR-0008 §3).
/// </summary>
/// <remarks>
/// <para>Scoped: it reads the request's <see cref="ICurrentUser"/> and stages into the request's unit of work.</para>
/// <para><b>Actor:</b> <see cref="AuditRecord.Actor"/> when given (configuration, the logging-in user), otherwise the
/// current user. Neither is a bug in the caller (an audited action without anyone to attribute it to), so it throws
/// rather than writing an anonymous entry; the save then fails closed.</para>
/// <para><b>Details</b> are serialized with the web JSON defaults (camelCase) and enums as camelCase strings, matching the
/// public API's JSON so the audit log can show them as-is (contract §10).</para>
/// </remarks>
/// <param name="currentUser">Who is executing the request.</param>
/// <param name="clock">Source of the entry's timestamp.</param>
/// <param name="repository">Where entries are staged.</param>
internal sealed class AuditTrail(ICurrentUser currentUser, IClock clock, IAuditEntryRepository repository) : IAuditTrail
{
    /// <summary>JSON options for <c>details</c>; shared so tests serialize exactly as production does.</summary>
    internal static readonly JsonSerializerOptions DetailsJsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false) },
    };

    /// <inheritdoc />
    public void Record(AuditRecord record)
    {
        ArgumentNullException.ThrowIfNull(record);

        var entry = AuditEntry.Record(
            ResolveActor(record),
            record.Action,
            record.TargetType,
            record.TargetId,
            record.TargetName,
            record.ClusterName,
            record.Summary,
            Activity.Current?.TraceId.ToHexString(),
            SerializeDetails(record.Details),
            clock.UtcNow,
            relatedUsername: record.RelatedUsername);

        repository.Add(entry);
    }

    /// <summary>Serializes an audit record's details to a JSON object string; <see langword="null"/> becomes <c>{}</c>.</summary>
    /// <param name="details">The details object (usually an anonymous type).</param>
    /// <returns>The JSON text.</returns>
    internal static string SerializeDetails(object? details) =>
        details is null ? "{}" : JsonSerializer.Serialize(details, details.GetType(), DetailsJsonOptions);

    private AuditActor ResolveActor(AuditRecord record)
    {
        if (record.Actor is not null)
        {
            // Each entry gets its own copy. Explicit actors are often shared instances (AuditActor.Configuration is a
            // static), and persistence stores the actor as an owned value of the entry: one instance referenced by two
            // entries staged in the same save would be persisted for only one of them.
            return record.Actor with { };
        }

        if (currentUser is { UserId: { } userId, Username: { } username })
        {
            return AuditActor.ForUser(userId, username);
        }

        throw new InvalidOperationException(
            $"Audit action '{record.Action}' has no explicit actor and there is no authenticated current user.");
    }
}
