namespace FleetConsole.Application.Auth;

/// <summary>
/// Who the host cluster says the logging-in user is: the <c>users/~</c> answer for the user's fresh OAuth access token
/// (ADR-0007). Produced by <see cref="IExternalIdentityClient"/> and passed to the login use case; carries no token.
/// </summary>
/// <param name="Username">The OpenShift <c>metadata.name</c>; becomes the FleetConsole username (validated by the
/// login use case, not here).</param>
/// <param name="FullName">The OpenShift <c>fullName</c>, or <see langword="null"/> when the user has none.</param>
/// <param name="Groups">The OpenShift groups exactly as reported, including virtual <c>system:*</c> groups; the login
/// use case drops those (see <see cref="OpenShiftGroups"/>).</param>
public sealed record ExternalIdentity(string Username, string? FullName, IReadOnlyList<string> Groups);
