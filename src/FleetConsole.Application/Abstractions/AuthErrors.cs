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
}
