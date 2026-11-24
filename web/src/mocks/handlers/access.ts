import type { AccessCandidateOutcome, AccessMode, EffectiveAccess, EffectiveClusterAccess } from '@/shared/api';
import { findCluster, findCredential, findUser, mockDb } from '../db';
import type { MockCluster, MockGrant, MockUser } from '../fixtures';
import { problem } from '../problem';
import { http } from './http';
import { ordinal } from './representations';

// The mock's one access resolver (PREC-8 mirror): the switcher (`GET /api/clusters`), the proxy and Effective access
// all ask it, so what a user can open and what the admin sees can't disagree (EFF-3).

/** One matching grant with why it won or lost (EFF-2). */
export interface ResolvedCandidate {
  grant: MockGrant;
  outcome: AccessCandidateOutcome;
  /** Winning group's name for `lowerPriority`/`tie*`; `null` for the winner and `overriddenByDirectGrant`. */
  beatenBy: string | null;
}

/** A user's access to one cluster: the winning grant, the effective mode and every candidate (winner first). */
export interface ResolvedAccess {
  winner: MockGrant;
  /** After the user's read-only flag (PREC-6). */
  accessMode: AccessMode;
  /** The winner was read-write and the user's read-only flag made it read-only. */
  narrowedByReadOnlyFlag: boolean;
  candidates: ResolvedCandidate[];
}

/** `system:*` groups (any case) never match a grant (GRP-3). */
export function isSystemGroup(name: string): boolean {
  return name.toLowerCase().startsWith('system:');
}

/** Group grant order (PREC-4/5): priority desc, then read-only first, then lower id (ordinal). */
function compareGroupGrants(a: MockGrant, b: MockGrant): number {
  const byPriority = (b.priority ?? 0) - (a.priority ?? 0);
  if (byPriority !== 0) return byPriority;
  if (a.accessMode !== b.accessMode) return a.accessMode === 'readOnly' ? -1 : 1;
  return ordinal(a.id, b.id);
}

/** Why `loser` lost to the group grant `winner`. */
function groupOutcome(loser: MockGrant, winner: MockGrant): AccessCandidateOutcome {
  if (loser.priority !== winner.priority) return 'lowerPriority';
  return loser.accessMode !== winner.accessMode ? 'tieReadOnlyWins' : 'tieBrokenById';
}

/**
 * Resolves `user`'s access to `clusterName` (PREC-3..7): none for a deactivated user or a missing/disabled cluster;
 * otherwise the direct grant beats every group grant (PREC-3), else the highest-priority group grant of the user's
 * **recorded** groups wins (PREC-1/4), ties go to read-only and then the lower id (PREC-5); the user's read-only flag
 * narrows the result (PREC-6). `undefined` when nothing matches.
 */
export function resolveAccess(user: MockUser, clusterName: string): ResolvedAccess | undefined {
  if (user.status === 'deactivated' || !findCluster(clusterName)?.isEnabled) return undefined;
  const groups = new Set(user.groups.filter((group) => !isSystemGroup(group)));
  const onCluster = mockDb.grants.filter((grant) => grant.clusterName === clusterName);
  const direct = onCluster.find((grant) => grant.subjectKind === 'user' && grant.subjectName === user.username);
  const viaGroups = onCluster
    .filter((grant) => grant.subjectKind === 'group' && groups.has(grant.subjectName))
    .sort(compareGroupGrants);

  const winner = direct ?? viaGroups[0];
  if (!winner) return undefined;
  const losers: ResolvedCandidate[] = (direct ? viaGroups : viaGroups.slice(1)).map((grant) =>
    direct
      ? { grant, outcome: 'overriddenByDirectGrant', beatenBy: null }
      : { grant, outcome: groupOutcome(grant, winner), beatenBy: winner.subjectName },
  );
  const narrowed = user.isReadOnly && winner.accessMode === 'readWrite';
  return {
    winner,
    accessMode: narrowed ? 'readOnly' : winner.accessMode,
    narrowedByReadOnlyFlag: narrowed,
    candidates: [{ grant: winner, outcome: 'winner', beatenBy: null }, ...losers],
  };
}

/** Name of a grant's credential, `(deleted)` like `toGrant`. */
const credentialNameOf = (grant: MockGrant) => findCredential(grant.credentialId)?.name ?? '(deleted)';

/** One Effective access row from a resolved access (contract CP4.5a §5). */
function toEffectiveClusterAccess(cluster: MockCluster, access: ResolvedAccess): EffectiveClusterAccess {
  const { winner } = access;
  return {
    clusterName: cluster.name,
    clusterDisplayName: cluster.displayName,
    clusterEnvironment: cluster.environment,
    accessMode: access.accessMode,
    narrowedByReadOnlyFlag: access.narrowedByReadOnlyFlag,
    source: {
      kind: winner.subjectKind,
      groupName: winner.subjectKind === 'group' ? winner.subjectName : null,
      priority: winner.priority,
    },
    credentialId: winner.credentialId,
    credentialName: credentialNameOf(winner),
    candidates: access.candidates.map(({ grant, outcome, beatenBy }) => ({
      grantId: grant.id,
      subjectKind: grant.subjectKind,
      subjectName: grant.subjectName,
      priority: grant.priority,
      accessMode: grant.accessMode,
      credentialName: credentialNameOf(grant),
      outcome,
      beatenBy,
    })),
  };
}

/** `GET /api/admin/users/{username}/effective-access` (EFF-1..4): rows from {@link resolveAccess}, by cluster name. */
export const effectiveAccessHandlers = [
  http.get('/api/admin/users/{username}/effective-access', ({ params, response }) => {
    const user = findUser(params.username);
    if (!user) {
      return problem(404, { code: 'Users.NotFound', detail: `User ${params.username} doesn't exist.` });
    }
    const clusters = [...mockDb.clusters]
      .sort((a, b) => ordinal(a.name, b.name))
      .flatMap((cluster) => {
        const access = resolveAccess(user, cluster.name);
        return access ? [toEffectiveClusterAccess(cluster, access)] : [];
      });
    const body: EffectiveAccess = {
      username: user.username,
      userIsReadOnly: user.isReadOnly,
      userStatus: user.status,
      groups: user.groups.filter((group) => !isSystemGroup(group)),
      // The mock records membership only at login (no revalidation clock), so "as of" = the last login (EFF-4).
      groupsAsOf: user.lastLoginAt,
      clusters,
    };
    return response(200).json(body);
  }),
];
