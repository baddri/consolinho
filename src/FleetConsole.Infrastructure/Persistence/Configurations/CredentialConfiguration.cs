using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FleetConsole.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="Credential"/> to <c>credentials</c>: the encrypted token as <c>bytea</c>, <see cref="TokenMetadata"/>
/// flattened into <c>token_*</c> columns and the optional <see cref="ConnectionTestSummary"/> into nullable
/// <c>last_test_*</c> columns. Credentials are deleted with their cluster (CLU-6, cascade).
/// </summary>
internal sealed class CredentialConfiguration : IEntityTypeConfiguration<Credential>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Credential> builder)
    {
        builder.MapAggregateRoot<Credential, CredentialId>("credentials");

        builder.Property(c => c.ClusterId);
        builder.HasOne<Cluster>().WithMany().HasForeignKey(c => c.ClusterId).OnDelete(DeleteBehavior.Cascade);

        builder.Property(c => c.Name).IsRequired();
        builder.HasIndex(c => new { c.ClusterId, c.Name }).IsUnique();

        builder.Property(c => c.Description).HasMaxLength(Credential.MaxDescriptionLength);
        builder.Property(c => c.Token).IsRequired();
        builder.Property(c => c.Fingerprint).IsRequired();

        builder.ComplexProperty(c => c.Metadata, metadata =>
        {
            metadata.IsRequired();
            metadata.Property(m => m.Type).HasColumnName("token_type");
            metadata.Property(m => m.Subject).HasColumnName("token_subject");
            metadata.Property(m => m.IssuedAt).HasColumnName("token_issued_at");
            metadata.Property(m => m.ExpiresAt).HasColumnName("token_expires_at");
            metadata.Ignore(m => m.ServiceAccount);
        });

        builder.ComplexProperty(c => c.LastTest, test =>
        {
            // Optional: all four columns are NULL when the current token was never tested.
            test.Property(t => t.TestedAt).HasColumnName("last_test_tested_at");
            test.Property(t => t.Succeeded).HasColumnName("last_test_succeeded");
            test.Property(t => t.FailedStep).HasColumnName("last_test_failed_step");
            test.Property(t => t.Headline).HasColumnName("last_test_headline");
        });

        builder.Property(c => c.CreatedAt);
        builder.Property(c => c.CreatedBy).HasMaxLength(Username.MaxLength).IsRequired();
        builder.Property(c => c.RotatedAt);
        builder.Property(c => c.RotatedBy).HasMaxLength(Username.MaxLength);
    }
}
