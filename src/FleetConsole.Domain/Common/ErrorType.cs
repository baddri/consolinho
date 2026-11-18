namespace FleetConsole.Domain.Common;

/// <summary>
/// Classifies an expected failure so the outer layers can react without inspecting error codes. The Api maps each
/// value to exactly one HTTP status (see <c>ResultExtensions</c> in FleetConsole.Api); keep this list short and stable.
/// </summary>
public enum ErrorType
{
    /// <summary>
    /// An expected failure that fits no more specific category (e.g. a downstream dependency rejected the operation).
    /// It is the default value so an uninitialised <see cref="ErrorType"/> never masquerades as a client error. Maps to 500.
    /// </summary>
    Failure = 0,

    /// <summary>The request is malformed or violates a business rule the caller can fix. Maps to 400.</summary>
    Validation = 1,

    /// <summary>The addressed resource does not exist (or the caller may not know that it exists). Maps to 404.</summary>
    NotFound = 2,

    /// <summary>The request conflicts with the current state (duplicate name, stale version). Maps to 409.</summary>
    Conflict = 3,

    /// <summary>The caller is authenticated but not allowed to perform the operation. Maps to 403.</summary>
    Forbidden = 4,

    /// <summary>The caller is not authenticated (or the session is no longer valid). Maps to 401.</summary>
    Unauthorized = 5,
}
