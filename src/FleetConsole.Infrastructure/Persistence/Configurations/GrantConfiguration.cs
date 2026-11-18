using FleetConsole.Domain.Access;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FleetConsole.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="Grant"/> to <c>grants</c>, with one grant per (user, cluster) enforced by a unique index.
/// </summary>
/// <remarks>
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
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Grant> builder)
    {
        builder.MapAggregateRoot<Grant, GrantId>("grants");

        builder.Property(g => g.UserId);
        builder.Property(g => g.ClusterId);
        builder.Property(g => g.CredentialId);

        builder.HasOne<User>().WithMany().HasForeignKey(g => g.UserId).OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_grants_users_user_id");   // the convention would derive "fk_grants_user_user_id"
        builder.HasOne<Cluster>().WithMany().HasForeignKey(g => g.ClusterId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Credential>().WithMany().HasForeignKey(g => g.CredentialId).OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(g => new { g.UserId, g.ClusterId }).IsUnique();
        builder.HasIndex(g => g.CredentialId);

        builder.Property(g => g.AccessMode).IsRequired();
        builder.Property(g => g.GrantedAt);
        builder.Property(g => g.GrantedBy).HasMaxLength(Username.MaxLength).IsRequired();
        builder.Property(g => g.UpdatedAt);
        builder.Property(g => g.UpdatedBy).HasMaxLength(Username.MaxLength);
    }
}
