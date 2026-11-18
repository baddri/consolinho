using System.Diagnostics.CodeAnalysis;

namespace FleetConsole.Domain.Common;

/// <summary>
/// Describes an <em>expected</em> failure: something a caller can cause and should be told about (a missing cluster, a
/// duplicate username, invalid input). Returned inside a <see cref="Result"/> instead of thrown, so control flow stays
/// explicit and the Api can map it to an RFC 9457 ProblemDetails response in one place.
/// </summary>
/// <remarks>
/// Exceptions remain the mechanism for bugs and infrastructure faults. <see cref="Code"/> is a stable,
/// machine-readable identifier (convention: <c>"&lt;Area&gt;.&lt;Reason&gt;"</c>, e.g. <c>"Clusters.NotFound"</c>) that
/// clients may switch on; <see cref="Message"/> is human-readable and is shown to the user, so it must never contain
/// secrets (tokens, passwords) or internal details. Use the static factories rather than the constructor so the
/// <see cref="ErrorType"/> always matches the intent.
/// </remarks>
/// <param name="Code">Stable machine-readable error code, e.g. <c>"Users.UsernameTaken"</c>.</param>
/// <param name="Message">Human-readable, user-safe description of what went wrong.</param>
/// <param name="Type">Category that decides how the error is surfaced (e.g. the HTTP status code).</param>
[SuppressMessage("Naming", "CA1716:Identifiers should not match keywords",
    Justification = "'Error' is only a keyword in VB; the name is the documented domain vocabulary (BACKEND.md) and the code base is C# only.")]
public record Error(string Code, string Message, ErrorType Type)
{
    /// <summary>Creates a generic failure (HTTP 500) for expected but uncategorised failures.</summary>
    /// <param name="code">Stable error code.</param>
    /// <param name="message">User-safe description.</param>
    /// <returns>An error of type <see cref="ErrorType.Failure"/>.</returns>
    public static Error Failure(string code, string message) => new(code, message, ErrorType.Failure);

    /// <summary>
    /// Creates a validation error that is not tied to a specific input field (e.g. a business rule spanning several
    /// fields). For per-field errors produced by validators use <see cref="Validation(IReadOnlyDictionary{string, string[]})"/>.
    /// </summary>
    /// <param name="code">Stable error code.</param>
    /// <param name="message">User-safe description.</param>
    /// <returns>An error of type <see cref="ErrorType.Validation"/>.</returns>
    public static Error Validation(string code, string message) => new(code, message, ErrorType.Validation);

    /// <summary>Creates a validation error carrying per-field messages (rendered as the ProblemDetails <c>errors</c> member).</summary>
    /// <param name="fieldErrors">Messages keyed by field name; see <see cref="ValidationError.Errors"/>.</param>
    /// <returns>A <see cref="ValidationError"/>.</returns>
    public static ValidationError Validation(IReadOnlyDictionary<string, string[]> fieldErrors) => new(fieldErrors);

    /// <summary>Creates a not-found error (HTTP 404).</summary>
    /// <param name="code">Stable error code.</param>
    /// <param name="message">User-safe description.</param>
    /// <returns>An error of type <see cref="ErrorType.NotFound"/>.</returns>
    public static Error NotFound(string code, string message) => new(code, message, ErrorType.NotFound);

    /// <summary>Creates a conflict error (HTTP 409), e.g. a duplicate natural key or a concurrency conflict.</summary>
    /// <param name="code">Stable error code.</param>
    /// <param name="message">User-safe description.</param>
    /// <returns>An error of type <see cref="ErrorType.Conflict"/>.</returns>
    public static Error Conflict(string code, string message) => new(code, message, ErrorType.Conflict);

    /// <summary>Creates a forbidden error (HTTP 403) for authenticated callers lacking permission.</summary>
    /// <param name="code">Stable error code.</param>
    /// <param name="message">User-safe description.</param>
    /// <returns>An error of type <see cref="ErrorType.Forbidden"/>.</returns>
    public static Error Forbidden(string code, string message) => new(code, message, ErrorType.Forbidden);

    /// <summary>Creates an unauthorized error (HTTP 401) for unauthenticated callers.</summary>
    /// <param name="code">Stable error code.</param>
    /// <param name="message">User-safe description.</param>
    /// <returns>An error of type <see cref="ErrorType.Unauthorized"/>.</returns>
    public static Error Unauthorized(string code, string message) => new(code, message, ErrorType.Unauthorized);
}
