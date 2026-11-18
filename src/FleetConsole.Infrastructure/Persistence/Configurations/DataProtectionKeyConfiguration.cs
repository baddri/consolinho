using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace FleetConsole.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps ASP.NET Core Data Protection's key entity to <c>data_protection_keys</c> (ADR-0004). One row per key, holding the
/// key XML (encrypted with the key-encryption certificate when configured). Shared by every replica, so session cookies
/// and encrypted SA tokens survive restarts and work on any instance.
/// </summary>
internal sealed class DataProtectionKeyConfiguration : IEntityTypeConfiguration<DataProtectionKey>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<DataProtectionKey> builder) => builder.ToTable("data_protection_keys");
}
