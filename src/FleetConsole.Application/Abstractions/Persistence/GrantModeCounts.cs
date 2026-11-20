using FleetConsole.Domain.Access;

namespace FleetConsole.Application.Abstractions.Persistence;

/// <summary>
/// How many grants use a credential, by access mode: the input of the grant-based hints (TEST-4), read with
/// <see cref="IGrantRepository.CountByModeAsync"/>. <see langword="null"/> instead of an instance means "no credential
/// known" (an unsaved token tested without <c>credentialId</c>), so there are no grant-based hints.
/// </summary>
/// <param name="ReadOnly">Grants with <see cref="AccessMode.ReadOnly"/>.</param>
/// <param name="ReadWrite">Grants with <see cref="AccessMode.ReadWrite"/>.</param>
public sealed record GrantModeCounts(int ReadOnly, int ReadWrite);
