namespace FleetConsole.Domain.Access.Resolution;

/// <summary>
/// The single implementation of grant precedence (ADR-0034 §4, PREC-8): given the grants of one cluster that may apply
/// to a user, decides which one applies and why the others don't. Pure and synchronous (no I/O, clock or logging), so
/// the proxy authorization query, the accessible-clusters query and the Effective access view all get the same answer.
/// </summary>
/// <remarks>
/// Rules, applied in order:
/// <list type="number">
/// <item><b>Membership (PREC-1, GRP-3).</b> Group candidates whose group is not in the user's recorded groups (ordinal
/// comparison) are dropped, as are candidates for <c>system:*</c> groups (any case) and <c>system:*</c> entries of the
/// user's groups: defence in depth behind the validator, since <c>system:authenticated</c> would grant everyone.
/// Dropped candidates do not appear in <see cref="AccessResolution.Verdicts"/>.</item>
/// <item><b>No candidate left</b>: <see langword="null"/> (no access).</item>
/// <item><b>Direct beats group (PREC-3).</b> A direct user grant wins, even a read-only one over a read-write group
/// grant; every group candidate is <see cref="CandidateOutcome.OverriddenByDirectGrant"/>.</item>
/// <item><b>Highest priority (PREC-4).</b> Otherwise the group grant with the highest priority wins; lower ones are
/// <see cref="CandidateOutcome.LowerPriority"/>.</item>
/// <item><b>Tie (PREC-5).</b> Among group grants sharing the top priority a read-only one beats read-write ones
/// (<see cref="CandidateOutcome.TieReadOnlyWins"/>); among equal modes the lowest grant id (oldest grant) wins
/// (<see cref="CandidateOutcome.TieBrokenById"/>), and <see cref="AccessResolution.TieDetected"/> is set.</item>
/// <item><b>Read-only flag (PREC-6).</b> The user's read-only flag is applied on top and only ever narrows.</item>
/// </list>
/// The result does not depend on the order of the inputs.
/// </remarks>
public static class AccessResolver
{
    /// <summary>Prefix of OpenShift's virtual groups (<c>system:authenticated</c>, ...), never grant subjects (GRP-3).</summary>
    private const string SystemGroupPrefix = "system:";

    /// <summary>Resolves which grant applies to a user on one cluster.</summary>
    /// <param name="candidates">The grants of ONE cluster that may apply to the user: their direct grant (if any) and
    /// group grants. The caller may pre-filter by membership; the resolver re-checks it.</param>
    /// <param name="userGroups">The user's groups as recorded at login or the last session revalidation.</param>
    /// <param name="userIsReadOnly">The user's read-only flag; the caller passes the stricter of the stored and session values.</param>
    /// <returns>The resolution, or <see langword="null"/> when no candidate applies (the user has no access).</returns>
    /// <exception cref="ArgumentException">A group candidate has a blank group name or no priority (a mapping bug).</exception>
    /// <exception cref="InvalidOperationException">More than one direct candidate; the unique index on (user, cluster)
    /// makes this impossible unless the data or the caller is broken.</exception>
    public static AccessResolution? Resolve(
        IReadOnlyCollection<AccessCandidate> candidates,
        IReadOnlyCollection<string> userGroups,
        bool userIsReadOnly)
    {
        ArgumentNullException.ThrowIfNull(candidates);
        ArgumentNullException.ThrowIfNull(userGroups);

        foreach (var candidate in candidates)
        {
            EnsureWellFormed(candidate);
        }

        var memberships = new HashSet<string>(userGroups.Where(g => !IsSystemGroup(g)), StringComparer.Ordinal);
        var applicable = candidates
            .Where(c => c.IsDirect || (!IsSystemGroup(c.GroupName!) && memberships.Contains(c.GroupName!)))
            .ToList();

        if (applicable.Count == 0)
        {
            return null;
        }

        var direct = applicable.Where(c => c.IsDirect).ToList();
        if (direct.Count > 1)
        {
            throw new InvalidOperationException(
                $"Found {direct.Count} direct grants for one user on one cluster; at most one may exist.");
        }

        // Canonical order for group candidates (priority descending, then grant id) makes the verdict list and the
        // tiebreak independent of input order. Guid ordering of v7 ids follows creation time, so "lowest" = oldest.
        var groups = applicable
            .Where(c => !c.IsDirect)
            .OrderByDescending(c => c.Priority!.Value)
            .ThenBy(c => c.GrantId.Value)
            .ToList();

        return direct.Count == 1
            ? ResolveDirect(direct[0], groups, userIsReadOnly)
            : ResolveByPriority(groups, userIsReadOnly);
    }

    /// <summary>PREC-3: the direct grant wins and every group grant is overridden.</summary>
    private static AccessResolution ResolveDirect(
        AccessCandidate winner, List<AccessCandidate> orderedGroups, bool userIsReadOnly)
    {
        var verdicts = new List<CandidateVerdict>(orderedGroups.Count + 1)
        {
            new(winner, CandidateOutcome.Winner, null),
        };
        verdicts.AddRange(orderedGroups.Select(c => new CandidateVerdict(c, CandidateOutcome.OverriddenByDirectGrant, null)));
        return Build(winner, verdicts, userIsReadOnly, tieDetected: false);
    }

    /// <summary>PREC-4/5: the highest priority wins; a tie at the top goes to read-only, then to the lowest grant id.</summary>
    private static AccessResolution ResolveByPriority(List<AccessCandidate> orderedGroups, bool userIsReadOnly)
    {
        var topPriority = orderedGroups[0].Priority!.Value;
        var tied = orderedGroups.TakeWhile(c => c.Priority == topPriority).ToList();

        // `tied` is already in grant-id order, so the first read-only one (or else the first one) is the winner.
        var winner = tied.FirstOrDefault(c => c.AccessMode == AccessMode.ReadOnly) ?? tied[0];

        var verdicts = new List<CandidateVerdict>(orderedGroups.Count)
        {
            new(winner, CandidateOutcome.Winner, null),
        };
        foreach (var candidate in orderedGroups)
        {
            if (ReferenceEquals(candidate, winner))
            {
                continue;
            }

            // A tied loser with a different mode can only be read-write losing to a read-only winner.
            var outcome = candidate.Priority < topPriority ? CandidateOutcome.LowerPriority
                : candidate.AccessMode != winner.AccessMode ? CandidateOutcome.TieReadOnlyWins
                : CandidateOutcome.TieBrokenById;
            verdicts.Add(new CandidateVerdict(candidate, outcome, winner.GroupName));
        }

        return Build(winner, verdicts, userIsReadOnly, tieDetected: tied.Count > 1);
    }

    /// <summary>PREC-6: applies the user's read-only flag on top of the winner's mode; it can only narrow.</summary>
    private static AccessResolution Build(
        AccessCandidate winner, List<CandidateVerdict> verdicts, bool userIsReadOnly, bool tieDetected)
    {
        var effectiveMode = userIsReadOnly || winner.AccessMode == AccessMode.ReadOnly
            ? AccessMode.ReadOnly
            : AccessMode.ReadWrite;
        var narrowed = userIsReadOnly && winner.AccessMode == AccessMode.ReadWrite;
        return new AccessResolution(winner, effectiveMode, narrowed, verdicts, tieDetected);
    }

    /// <summary>Rejects candidates a correct mapping never produces: group grants without a name or a priority.</summary>
    private static void EnsureWellFormed(AccessCandidate candidate)
    {
        ArgumentNullException.ThrowIfNull(candidate);
        if (candidate.IsDirect)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(candidate.GroupName))
        {
            throw new ArgumentException(
                $"Group candidate {candidate.GrantId.Value} has a blank group name.", nameof(candidate));
        }

        if (candidate.Priority is null)
        {
            throw new ArgumentException(
                $"Group candidate {candidate.GrantId.Value} ('{candidate.GroupName}') has no priority.", nameof(candidate));
        }
    }

    /// <summary>GRP-3: OpenShift virtual groups, matched case-insensitively so <c>System:Authenticated</c> is caught too.</summary>
    private static bool IsSystemGroup(string group) =>
        group.StartsWith(SystemGroupPrefix, StringComparison.OrdinalIgnoreCase);
}
