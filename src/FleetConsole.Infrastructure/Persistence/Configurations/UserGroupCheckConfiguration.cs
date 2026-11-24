using FleetConsole.Application.Abstractions.Persistence;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FleetConsole.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps <see cref="UserGroupCheck"/> to <c>user_group_checks</c> (ADR-0039 §4): one row per user, keyed by the user id,
/// holding when their host groups were last read. Not an aggregate (no <c>xmin</c>, no domain events); written by
/// <see cref="Repositories.UserGroupCheckRecorder"/> with an upsert.
/// </summary>
/// <remarks>
/// Foreign key to <c>users</c>: <b>RESTRICT</b>, like every reference to users (users are never deleted). The
/// relationship also makes EF insert a staged row after the new user it belongs to (first login).
/// </remarks>
internal sealed class UserGroupCheckConfiguration : IEntityTypeConfiguration<UserGroupCheck>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<UserGroupCheck> builder)
    {
        builder.ToTable("user_group_checks"); // also spelled out in the recorder's upsert SQL
        builder.HasKey(c => c.UserId);
        builder.Property(c => c.UserId).ValueGeneratedNever();
        builder.Property(c => c.CheckedAt).IsRequired();
        builder.HasOne<User>().WithMany().HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
