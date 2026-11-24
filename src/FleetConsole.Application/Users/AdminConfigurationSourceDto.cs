using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users;

// Part of the CurrentUser, UserListItem and UserDetail schemas in the OpenAPI document (POL-4); the XML docs below are
// written for API consumers.

/// <summary>Why configuration makes a user an administrator.</summary>
/// <param name="Kind">userList: listed in the bootstrap admin users; group: member of a configured admin group.</param>
/// <param name="Group">The admin group name when kind is group; null otherwise.</param>
public sealed record AdminConfigurationSourceDto(AdminConfigurationSourceKind Kind, string? Group)
{
    /// <summary>Maps the Domain value to its wire shape; <see langword="null"/> stays <see langword="null"/>.</summary>
    /// <param name="source">The user's configuration source, or <see langword="null"/> when configuration doesn't make them admin.</param>
    /// <returns>The DTO, or <see langword="null"/>.</returns>
    public static AdminConfigurationSourceDto? From(AdminConfigurationSource? source) =>
        source is null ? null : new AdminConfigurationSourceDto(source.Kind, source.Group);
}
