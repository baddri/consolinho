using FleetConsole.Application.Abstractions;
using FleetConsole.Application.Abstractions.Messaging;
using FleetConsole.Application.Access;
using FleetConsole.Domain.Access;
using FleetConsole.Domain.Access.Resolution;
using FleetConsole.Domain.Common;
using FleetConsole.Domain.Users;

namespace FleetConsole.Application.Users.GetEffectiveAccess;

/// <summary>
/// Answers <see cref="GetEffectiveAccessQuery"/> with two statements: the user (with their last group check) and
/// <see cref="ClusterAccessReader.LoadAsync"/> — the very resolution the proxy and the switcher use (PREC-8) — whose
/// verdicts are mapped to the response. No precedence rule lives here.
/// </summary>
/// <param name="readModel">The read model.</param>
/// <param name="reader">The shared access reader (T-0253).</param>
internal sealed class GetEffectiveAccessHandler(IReadModel readModel, ClusterAccessReader reader)
    : IRequestHandler<GetEffectiveAccessQuery, Result<EffectiveAccessDto>>
{
    /// <inheritdoc />
    public async Task<Result<EffectiveAccessDto>> Handle(GetEffectiveAccessQuery request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // An invalid username can't name a stored user: 404 like any unknown route id (ADR-0013 §8).
        var name = Username.Create(request.Username);
        if (name.IsFailure)
        {
            return UserErrors.NotFound(request.Username);
        }

        var username = name.Value;
        // Status is derived like UserRow.Project (User.Status isn't mapped); the check time is a scalar subquery, so
        // this stays one statement.
        var query = readModel.Users
            .Where(u => u.Username == username)
            .Select(u => new
            {
                u.Id,
                u.IsReadOnly,
                Status = u.IsDeactivated ? UserStatus.Deactivated : u.LastLoginAt == null ? UserStatus.Pending : UserStatus.Active,
                u.Groups,
                u.LastLoginAt,
                CheckedAt = readModel.UserGroupChecks.Where(c => c.UserId == u.Id).Select(c => (DateTimeOffset?)c.CheckedAt).FirstOrDefault(),
            });
        var user = await readModel.FirstOrDefaultAsync(query, cancellationToken).ConfigureAwait(false);
        if (user is null)
        {
            return UserErrors.NotFound(request.Username);
        }

        // The stored flag only (admin view); the switcher also ORs the session flag, which equals the stored one once
        // the session is revalidated. A deactivated user yields no rows (the reader joins active users only).
        var accesses = await reader.LoadAsync(user.Id, cluster: null, sessionIsReadOnly: false, cancellationToken).ConfigureAwait(false);

        IReadOnlyList<EffectiveClusterAccessDto> clusters =
        [
            .. accesses
                .OrderBy(a => a.ClusterName.Value, StringComparer.Ordinal)
                .Select(a => ToCluster(a, username.Value)),
        ];
        return Result.Success(new EffectiveAccessDto(
            username.Value, user.IsReadOnly, user.Status, user.Groups, Later(user.LastLoginAt, user.CheckedAt), clusters));
    }

    /// <summary>Maps one resolved cluster; the verdicts are already winner first, then by priority descending.</summary>
    internal static EffectiveClusterAccessDto ToCluster(ResolvedClusterAccess access, string username)
    {
        var resolution = access.Resolution;
        var winner = resolution.Winner;
        return new EffectiveClusterAccessDto(
            access.ClusterName.Value,
            access.ClusterDisplayName,
            access.Environment,
            resolution.EffectiveMode,
            resolution.NarrowedByReadOnlyFlag,
            new AccessSourceDto(KindOf(winner), winner.GroupName, winner.Priority),
            winner.CredentialId.Value,
            access.WinnerCredentialName,
            [
                .. resolution.Verdicts.Select(v => new AccessCandidateDto(
                    v.Candidate.GrantId.Value,
                    KindOf(v.Candidate),
                    v.Candidate.GroupName ?? username,
                    v.Candidate.Priority,
                    v.Candidate.AccessMode,
                    access.CandidateCredentialNames[v.Candidate.GrantId],
                    v.Outcome,
                    v.BeatenByGroup)),
            ]);
    }

    private static GrantSubjectKind KindOf(AccessCandidate candidate) =>
        candidate.IsDirect ? GrantSubjectKind.User : GrantSubjectKind.Group;

    // Login records a group check at the same instant, so the check is normally the later one; the max also covers
    // users who last logged in before check recording existed (EFF-4).
    private static DateTimeOffset? Later(DateTimeOffset? lastLogin, DateTimeOffset? checkedAt) =>
        lastLogin is null ? checkedAt : checkedAt is null ? lastLogin : lastLogin > checkedAt ? lastLogin : checkedAt;
}
