namespace FleetConsole.Application.Abstractions.Messaging;

/// <summary>
/// Declares that a request may only be executed by users holding a specific role (e.g. admin commands). Implies
/// <see cref="IRequireAuthenticated"/>. Enforced by the <c>AuthorizationBehavior</c> (CP1), which returns
/// <see cref="Domain.Common.ErrorType.Forbidden"/> for authenticated users without the role.
/// </summary>
/// <remarks>
/// The role is a string for now because the <c>UserRole</c> domain type arrives with users in CP1; switch the property
/// type to <c>UserRole</c> then. Implement as an expression-bodied property: <c>public string RequiredRole =&gt; "Admin";</c>.
/// </remarks>
public interface IRequireRole : IRequireAuthenticated
{
    /// <summary>The role the current user must hold, compared with <see cref="Abstractions.ICurrentUser.IsInRole"/>.</summary>
    string RequiredRole { get; }
}
