namespace FleetConsole.Domain.Access;

/// <summary>
/// What a grant lets the user do on its cluster (GRANT-1). Enforced by FleetConsole's proxy (CP2 mutation guard) on top of
/// whatever the credential's token itself allows.
/// </summary>
public enum AccessMode
{
    /// <summary>Reads only; the proxy refuses mutations even if the token could perform them. The default (GRANT-2).</summary>
    ReadOnly = 0,

    /// <summary>Reads and mutations, as far as the credential's token allows.</summary>
    ReadWrite = 1,
}
