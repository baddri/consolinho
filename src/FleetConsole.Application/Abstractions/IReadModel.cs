namespace FleetConsole.Application.Abstractions;

/// <summary>
/// Port through which query handlers read data: no-tracking, read-only access that projects straight to DTOs,
/// so queries never load aggregates just to map them (BACKEND.md "Use case folder convention").
/// </summary>
/// <remarks>
/// Placeholder until the first persisted aggregate exists (CP1). Features then add one read-only
/// <c>IQueryable&lt;T&gt;</c> member per readable aggregate (e.g. <c>IQueryable&lt;Cluster&gt; Clusters</c>),
/// implemented by Infrastructure with <c>AsNoTracking()</c> over the EF Core context.
/// </remarks>
public interface IReadModel;
