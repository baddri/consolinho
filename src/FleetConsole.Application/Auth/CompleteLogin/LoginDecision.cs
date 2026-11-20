namespace FleetConsole.Application.Auth.CompleteLogin;

/// <summary>The result of <see cref="CompleteLoginCommand"/>; the Api maps the denials to <c>/login?error=…</c> (contract §4.2).</summary>
public enum LoginDecision
{
    /// <summary>The user may sign in; a session is issued.</summary>
    Allowed,

    /// <summary>Unknown user while auto-provisioning is off, or an unusable username (AUTH-6) → <c>not_registered</c>.</summary>
    NotRegistered,

    /// <summary>The FleetConsole user is deactivated (AUTH-7) → <c>deactivated</c>.</summary>
    Deactivated,
}
