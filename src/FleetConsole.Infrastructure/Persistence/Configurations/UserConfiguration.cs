using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FleetConsole.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="User"/> to <c>users</c>. The effective role, status and "active writable admin" are derived in the
/// Domain and not stored; queries compute them from <c>is_admin_by_assignment</c>, <c>admin_configuration_source</c>,
/// <c>is_deactivated</c>, <c>is_read_only</c> and <c>last_login_at</c> (ADR-0009).
/// </summary>
internal sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.MapAggregateRoot<User, UserId>("users");

        builder.Property(u => u.Username).IsRequired();
        builder.HasIndex(u => u.Username).IsUnique();

        builder.Property(u => u.DisplayName);
        builder.Property(u => u.IsAdminByAssignment);
        builder.Property(u => u.AdminConfigurationSource);
        builder.Property(u => u.IsReadOnly);
        builder.Property(u => u.IsDeactivated);
        builder.Property(u => u.LastLoginAt);

        // OpenShift groups at the last login, as a native text[] (informational, never queried by element).
        builder.PrimitiveCollection(u => u.Groups).IsRequired();

        builder.Property(u => u.SecurityStamp);
        builder.Property(u => u.CreatedAt);
        builder.Property(u => u.CreatedBy).HasMaxLength(Username.MaxLength).IsRequired();

        builder.Ignore(u => u.Role);
        builder.Ignore(u => u.Status);
        builder.Ignore(u => u.IsActiveWritableAdmin);
    }
}
