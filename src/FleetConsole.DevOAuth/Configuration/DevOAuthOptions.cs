namespace FleetConsole.DevOAuth.Configuration;

/// <summary>
/// The emulator's configuration (section <c>DevOAuth</c> in <c>appsettings.json</c>): the OAuth clients it accepts and
/// the users offered on the authorize page. Values are obviously fake development data, never real secrets.
/// </summary>
/// <remarks>Validated at startup by <see cref="DevOAuthOptionsValidator"/>.</remarks>
internal sealed class DevOAuthOptions
{
    /// <summary>Configuration section the options bind to.</summary>
    public const string SectionName = "DevOAuth";

    /// <summary>
    /// OAuth clients allowed to use the emulator. In production the equivalent is the ServiceAccount used as OAuth
    /// client (ADR-0007); here the Api's dev configuration uses <c>fleetconsole-dev</c>.
    /// </summary>
    public IReadOnlyList<DevOAuthClient> Clients { get; init; } = [];

    /// <summary>Users shown as buttons on the authorize page; their groups are returned by <c>users/~</c>.</summary>
    public IReadOnlyList<DevOAuthUser> Users { get; init; } = [];

    /// <summary>
    /// The fake bearer token that may list <c>groups</c> (the stand-in for FleetConsole's host SA token, ADR-0039 §5;
    /// the AppHost passes the same value to the Api as <c>Auth:HostGroups:Token</c>). Unset = every list request is 401.
    /// </summary>
    public string? GroupsReaderToken { get; init; }
}

/// <summary>An OAuth client registration: the id and secret the Api presents at the token endpoint.</summary>
internal sealed class DevOAuthClient
{
    /// <summary>The <c>client_id</c> sent on the authorize and token requests.</summary>
    public string ClientId { get; init; } = string.Empty;

    /// <summary>The <c>client_secret</c> checked at the token endpoint (HTTP Basic or form field).</summary>
    public string ClientSecret { get; init; } = string.Empty;
}

/// <summary>A user the developer can sign in as, mirroring the fields OpenShift's <c>users/~</c> returns.</summary>
internal sealed class DevOAuthUser
{
    /// <summary>The OpenShift username (<c>metadata.name</c>), e.g. <c>alice</c>; unique.</summary>
    public string Name { get; init; } = string.Empty;

    /// <summary>Optional display name (<c>fullName</c>); omitted from <c>users/~</c> when null, as on OpenShift.</summary>
    public string? FullName { get; init; }

    /// <summary>
    /// The user's own groups. <c>users/~</c> additionally reports the virtual groups every OAuth-authenticated user
    /// has on OpenShift (<c>system:authenticated</c>, <c>system:authenticated:oauth</c>).
    /// </summary>
    public IReadOnlyList<string> Groups { get; init; } = [];
}
