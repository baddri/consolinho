using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FleetConsole.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="Grant"/> to <c>grants</c>: user and group grants share the table, told apart by
/// <c>subject_kind</c> (ADR-0034).
/// </summary>
/// <remarks>
/// <para><b>Subject shape.</b> Check constraint <c>ck_grants_subject</c> mirrors the aggregate's invariant: a user grant
/// has <c>user_id</c> and no group/priority; a group grant has <c>group_name</c> and a priority in
/// <see cref="Grant.MinPriority"/>..<see cref="Grant.MaxPriority"/> and no user. <c>subject_kind</c> is text like every
/// enum (<see cref="ConsoleDbContext"/>); rows from before group grants got <c>'User'</c> as the column default.</para>
/// <para><b>Uniqueness</b> (race backups for the aggregate's checks; violations surface as
/// <c>DuplicateKeyException</c>): (user, cluster), where NULL user ids of group grants are distinct in PostgreSQL;
/// (group, cluster) and (cluster, priority), both filtered to group grants (GRP-5, GRP-4). A plain index on
/// <c>group_name</c> serves "grants of these groups" lookups, which can't use the partial indexes.</para>
/// Foreign keys (BACKEND.md "Persistence"):
/// <list type="bullet">
///   <item>cluster: <b>CASCADE</b>. Deleting a cluster removes its grants (CLU-6).</item>
///   <item>user: <b>RESTRICT</b>. Users are never deleted; a delete attempt fails immediately.</item>
///   <item>credential: <b>NO ACTION</b>, not RESTRICT. Deleting a cluster cascades to its credentials <em>and</em> its
///   grants in one statement; NO ACTION is checked at the end of the statement, after the cascaded grants are gone,
///   whereas RESTRICT would fail the cluster delete. Deleting a credential that a grant still uses fails (CRED-6).</item>
/// </list>
/// </remarks>
internal sealed class GrantConfiguration : IEntityTypeConfiguration<Grant>
{
    /// <summary>Partial-index filter selecting group grants.</summary>
    private const string GroupGrantsOnly = "subject_kind = '" + nameof(GrantSubjectKind.Group) + "'";

    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Grant> builder)
    {
        builder.MapAggregateRoot<Grant, GrantId>("grants");

        builder.ToTable(table => table.HasCheckConstraint(
            "ck_grants_subject",
            $"(subject_kind = '{nameof(GrantSubjectKind.User)}' AND user_id IS NOT NULL AND group_name IS NULL AND priority IS NULL) OR " +
            $"(subject_kind = '{nameof(GrantSubjectKind.Group)}' AND user_id IS NULL AND group_name IS NOT NULL " +
            $"AND priority BETWEEN {Grant.MinPriority} AND {Grant.MaxPriority})"));

        builder.Property(g => g.SubjectKind).IsRequired();
        builder.Property(g => g.UserId);
        builder.Property(g => g.GroupName);
        builder.Property(g => g.Priority);
        builder.Property(g => g.ClusterId);
        builder.Property(g => g.CredentialId);

        builder.HasOne<User>().WithMany().HasForeignKey(g => g.UserId).OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_grants_users_user_id");   // the convention would derive "fk_grants_user_user_id"
        builder.HasOne<Cluster>().WithMany().HasForeignKey(g => g.ClusterId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Credential>().WithMany().HasForeignKey(g => g.CredentialId).OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(g => new { g.UserId, g.ClusterId }).IsUnique();
        builder.HasIndex(g => new { g.GroupName, g.ClusterId }).IsUnique().HasFilter(GroupGrantsOnly);
        builder.HasIndex(g => new { g.ClusterId, g.Priority }).IsUnique().HasFilter(GroupGrantsOnly);
        builder.HasIndex(g => g.GroupName);
        builder.HasIndex(g => g.ClusterId);   // explicit: (cluster_id, priority) is partial, so it can't serve the FK
        builder.HasIndex(g => g.CredentialId);

        builder.Property(g => g.AccessMode).IsRequired();
        builder.Property(g => g.GrantedAt);
        builder.Property(g => g.GrantedBy).HasMaxLength(Username.MaxLength).IsRequired();
        builder.Property(g => g.UpdatedAt);
        builder.Property(g => g.UpdatedBy).HasMaxLength(Username.MaxLength);
    }
}
