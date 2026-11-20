using FleetConsole.Domain.Access;
using FleetConsole.Domain.Audit;
using FleetConsole.Domain.Clusters;
using FleetConsole.Domain.Credentials;
using FleetConsole.Domain.Users;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace FleetConsole.Infrastructure.Persistence.Converters;

// Strongly typed ids are stored as their GUID (uuid column). Registered for every property of the id type, including
// foreign keys on other aggregates and nullable uses (AuditActor.UserId), by ConsoleDbContext.ConfigureConventions.

/// <summary>Stores a <see cref="UserId"/> as its GUID.</summary>
internal sealed class UserIdConverter() : ValueConverter<UserId, Guid>(id => id.Value, value => new UserId(value));

/// <summary>Stores a <see cref="ClusterId"/> as its GUID.</summary>
internal sealed class ClusterIdConverter() : ValueConverter<ClusterId, Guid>(id => id.Value, value => new ClusterId(value));

/// <summary>Stores a <see cref="CredentialId"/> as its GUID.</summary>
internal sealed class CredentialIdConverter() : ValueConverter<CredentialId, Guid>(id => id.Value, value => new CredentialId(value));

/// <summary>Stores a <see cref="GrantId"/> as its GUID.</summary>
internal sealed class GrantIdConverter() : ValueConverter<GrantId, Guid>(id => id.Value, value => new GrantId(value));

/// <summary>Stores an <see cref="AuditEntryId"/> as its GUID.</summary>
internal sealed class AuditEntryIdConverter() : ValueConverter<AuditEntryId, Guid>(id => id.Value, value => new AuditEntryId(value));
