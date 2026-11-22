using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Users;
using FleetConsole.Infrastructure.Persistence.Converters;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FleetConsole.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="Cluster"/> to <c>clusters</c>. The <see cref="ApiServerEndpoint"/> value object is a complex property
/// flattened into <c>api_url</c> (canonical text), <c>ca_bundle</c> (PEM) and <c>skip_tls_verify</c>; it is
/// materialized through its private constructor, and the derived <c>TlsMode</c> and CA certificate summaries are not stored.
/// </summary>
internal sealed class ClusterConfiguration : IEntityTypeConfiguration<Cluster>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<Cluster> builder)
    {
        builder.MapAggregateRoot<Cluster, ClusterId>("clusters");

        builder.Property(c => c.Name).IsRequired();
        builder.HasIndex(c => c.Name).IsUnique();

        builder.Property(c => c.DisplayName).HasMaxLength(Cluster.MaxDisplayNameLength).IsRequired();

        builder.ComplexProperty(c => c.Endpoint, endpoint =>
        {
            endpoint.IsRequired();
            endpoint.Property(e => e.Url)
                .HasColumnName("api_url")
                .HasConversion<ApiUrlConverter>()
                .HasMaxLength(ApiServerEndpoint.MaxUrlLength)
                .IsRequired();
            endpoint.Property(e => e.CaBundle).HasColumnName("ca_bundle");
            endpoint.Property(e => e.SkipTlsVerify).HasColumnName("skip_tls_verify");
            endpoint.Ignore(e => e.TlsMode);
        });

        builder.Property(c => c.Environment).IsRequired();
        builder.Property(c => c.Distribution).IsRequired();
        builder.Property(c => c.WebConsoleUrl)
            .HasConversion<OriginalUriConverter>()
            .HasMaxLength(Cluster.MaxWebConsoleUrlLength);
        builder.Property(c => c.Description).HasMaxLength(Cluster.MaxDescriptionLength);
        builder.Property(c => c.IsEnabled);
        builder.Property(c => c.ConnectionSettingsChangedAt);
        builder.Property(c => c.CreatedAt);
        builder.Property(c => c.CreatedBy).HasMaxLength(Username.MaxLength).IsRequired();
        builder.Property(c => c.UpdatedAt);
        builder.Property(c => c.UpdatedBy).HasMaxLength(Username.MaxLength);
    }
}
