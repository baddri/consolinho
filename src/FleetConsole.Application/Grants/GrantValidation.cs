namespace FleetConsole.Application.Grants;

/// <summary>Messages shared by the grant validators.</summary>
internal static class GrantValidation
{
    /// <summary>The message for an access mode outside the enum (only reachable with integer values; JSON uses names).</summary>
    public const string AccessModeMessage = "Access mode must be readOnly or readWrite.";
}
