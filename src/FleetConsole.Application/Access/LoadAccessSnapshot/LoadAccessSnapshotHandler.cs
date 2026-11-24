using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Common;

namespace FleetConsole.Application.Access.LoadAccessSnapshot;

/// <summary>
/// Answers <see cref="LoadAccessSnapshotQuery"/> on a cache miss with <b>one SQL statement</b> (ADR-0019, PREC-1): the
/// active user with, as a collection projection, every grant that names them directly <em>or</em> names one of their
/// groups (<c>group_name = ANY(users.groups)</c>), joined with its cluster and credential.
/// </summary>
/// <remarks>
/// <para>The user row comes back even without grants, so the snapshot still carries the user's groups (and their
/// <c>group:</c> tags). Clusters are not filtered by <c>IsEnabled</c>; the reader does that per request.</para>
/// <para>Queries only through <see cref="IReadModel"/> terminal operators, so a database outage surfaces as
/// <c>PersistenceUnavailableException</c> (503, CACHE-5) and nothing is cached.</para>
/// </remarks>
/// <param name="readModel">No-tracking queryables.</param>
internal sealed class LoadAccessSnapshotHandler(IReadModel readModel)
    : IRequestHandler<LoadAccessSnapshotQuery, Result<AccessSnapshot>>
{
    /// <inheritdoc />
    public async Task<Result<AccessSnapshot>> Handle(LoadAccessSnapshotQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // Locals so EF Core inlines the queryables into the user query (one statement).
        var grants = readModel.Grants;
        var clusters = readModel.Clusters;
        var credentials = readModel.Credentials;
        var query = readModel.Users
            .Where(u => u.Id == request.UserId && !u.IsDeactivated)
            .Select(u => new
            {
                u.Username,
                u.IsReadOnly,
                u.Groups,
                Rows = (
                    from g in grants
                    // The (string) cast is GroupName's explicit operator: EF translates it to the text column, so this
                    // becomes "g.group_name = ANY (u.groups)"; in memory (unit tests) it simply returns the value.
                    where g.UserId == u.Id
                        || (g.SubjectKind == GrantSubjectKind.Group && g.GroupName != null && u.Groups.Contains((string)g.GroupName))
                    join c in clusters on g.ClusterId equals c.Id
                    join cr in credentials on g.CredentialId equals cr.Id
                    select new
                    {
                        ClusterId = c.Id,
                        ClusterName = c.Name,
                        c.DisplayName,
                        c.IsEnabled,
                        c.Environment,
                        c.Distribution,
                        c.Endpoint,
                        c.WebConsoleUrl,
                        GrantId = g.Id,
                        g.GroupName,
                        g.Priority,
                        g.AccessMode,
                        g.CredentialId,
                        CredentialName = cr.Name,
                        cr.Token,
                    })
                    .ToList(),
            });

        var user = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        if (user is null)
        {
            return AccessSnapshot.NotFound;
        }

        var rows = user.Rows
            .Select(r => new AccessSnapshotRow(
                r.ClusterId.Value,
                r.ClusterName.Value,
                r.DisplayName,
                r.IsEnabled,
                r.Environment.ToString(),
                r.Distribution.ToString(),
                r.Endpoint.Url.OriginalString,
                r.Endpoint.CaBundle?.Pem,
                r.Endpoint.SkipTlsVerify,
                r.WebConsoleUrl?.OriginalString,
                r.GrantId.Value,
                r.GroupName?.Value,
                r.Priority,
                r.AccessMode.ToString(),
                r.CredentialId.Value,
                r.CredentialName.Value,
                r.Token.Value))
            .ToList();

        return new AccessSnapshot(true, user.Username.Value, user.IsReadOnly, [.. user.Groups], rows);
    }
}
