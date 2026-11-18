using FleetConsole.Domain.Audit;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FleetConsole.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="AuditEntry"/> to <c>audit_entries</c> (append-only, AUD-3). The <see cref="AuditActor"/> is flattened
/// into <c>actor_*</c> columns (an owned type) and the details are stored as <c>jsonb</c>. Names are copied text, not foreign keys, so
/// entries survive the deletion of what they describe.
/// </summary>
/// <remarks>
/// Indexes serve the audit-log query (contract §10): <c>(occurred_at DESC, id DESC)</c> for newest-first keyset pages,
/// plus <c>actor_name</c>, <c>related_username</c> and <c>cluster_name</c> for the exact-match filters (the <c>user</c>
/// filter matches <c>actor_name</c> or <c>related_username</c>). Text columns have no length limits: an
/// audit write must never fail because of a display value's length.
/// </remarks>
internal sealed class AuditEntryConfiguration : IEntityTypeConfiguration<AuditEntry>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<AuditEntry> builder)
    {
        builder.MapAggregateRoot<AuditEntry, AuditEntryId>("audit_entries");

        // Owned (same table) rather than a complex property like the other value objects: EF Core 10 can't index
        // complex-type columns, and the audit filter needs an index on actor_name.
        builder.OwnsOne(a => a.Actor, actor =>
        {
            actor.Property(x => x.UserId).HasColumnName("actor_user_id");
            actor.Property(x => x.Name).HasColumnName("actor_name").IsRequired();
            actor.Property(x => x.IsSystem).HasColumnName("actor_is_system");
            actor.HasIndex(x => x.Name).HasDatabaseName("ix_audit_entries_actor_name");
        });
        builder.Navigation(a => a.Actor).IsRequired();

        builder.Property(a => a.Action).IsRequired();
        builder.Property(a => a.Category).IsRequired();
        builder.Property(a => a.TargetType).IsRequired();
        builder.Property(a => a.TargetId);
        builder.Property(a => a.TargetName).IsRequired();
        builder.Property(a => a.ClusterName);
        builder.Property(a => a.RelatedUsername);
        builder.Property(a => a.Summary).IsRequired();
        builder.Property(a => a.CorrelationId);
        builder.Property(a => a.DetailsJson).HasColumnName("details").HasColumnType("jsonb").IsRequired();
        builder.Property(a => a.OccurredAt);

        builder.HasIndex(a => new { a.OccurredAt, a.Id }).IsDescending(true, true);
        builder.HasIndex(a => a.ClusterName);
        builder.HasIndex(a => a.RelatedUsername);
    }
}
