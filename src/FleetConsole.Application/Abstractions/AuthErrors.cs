using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Errors produced by the request-level security checks (authorization and read-only behaviors). Codes and messages
/// are part of the API contract (<c>docs/specs/CP1-api-contract.md</c> §2); the SPA shows <c>detail</c> verbatim.
/// </summary>
/// <remarks>
/// The Api's cookie handler writes the same <c>Auth.Unauthenticated</c>/<c>Auth.Forbidden</c> codes for endpoint-level
/// challenges, so clients see one code per situation whichever layer refused the request.
/// </remarks>
public static class AuthErrors
{
    /// <summary>The request needs a signed-in user and there is none (no, invalid or ended session) → 401.</summary>
    public static readonly Error Unauthenticated = Error.Unauthorized("Auth.Unauthenticated", "Authentication required.");

    /// <summary>The signed-in user lacks the role the request requires (non-admin calling Administration) → 403.</summary>
    public static readonly Error Forbidden = Error.Forbidden("Auth.Forbidden", "You don't have access to Fleet administration.");

    /// <summary>A globally read-only user attempted a mutating command (ADM-2) → 403.</summary>
    public static readonly Error ReadOnly = Error.Forbidden("Auth.ReadOnly", "Your account is read-only.");

    /// <summary>
    /// Session revalidation could not read the host's groups while the user's recorded groups carry grants (ADR-0039 §3):
    /// stale membership could keep access that was removed on the host, so the session ends. Internal; never mapped to
    /// an HTTP response (the request continues anonymous and protected endpoints answer 401).
    /// </summary>
    public static readonly Error GroupsUnavailable = Error.Failure(
        "Auth.GroupsUnavailable", "Your group membership could not be verified. Sign in again.");
}
