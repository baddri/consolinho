using FleetConsole.Api.Auth;

namespace FleetConsole.Api.Endpoints.Admin;

/// <summary>
/// <c>/api/admin</c>: the Administration area (users, clusters, credentials, grants, audit). The group requires the
/// <see cref="AuthorizationPolicies.Admin"/> policy on top of the <c>/api</c> group's authenticated session; the use
/// cases additionally implement <c>IAdminRequest</c>, so the role is checked in the pipeline too (SECURITY.md).
/// </summary>
/// <remarks>
/// Each admin feature lives in <c>Endpoints/Admin/&lt;Feature&gt;AdminEndpoints.cs</c> with a
/// <c>Map&lt;Feature&gt;AdminEndpoints(this RouteGroupBuilder admin)</c> extension and adds one call in
/// <see cref="MapAdminEndpoints"/>. Request records (<c>&lt;Action&gt;Request</c>) live next to their endpoint file;
/// <see cref="VersionRequest"/> is shared by all body-less transitions.
/// </remarks>
public static class AdminEndpoints
{
    /// <summary>Creates the <c>/api/admin</c> group and maps every admin feature into it.</summary>
    /// <param name="api">The <c>/api</c> group.</param>
    /// <returns>The <c>/api/admin</c> group.</returns>
    public static RouteGroupBuilder MapAdminEndpoints(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);

        var admin = api.MapGroup("/admin")
            .RequireAuthorization(AuthorizationPolicies.Admin)
            .WithTags("Admin");

        // Feature tasks add one Map<Feature>AdminEndpoints() call each (T-0016 users, T-0017 clusters, ...).
        admin.MapUsersAdminEndpoints();
        admin.MapCredentialsAdminEndpoints();
        admin.MapClustersAdminEndpoints();
        admin.MapAuditAdminEndpoints();
        admin.MapGrantsAdminEndpoints();

        return admin;
    }
}
