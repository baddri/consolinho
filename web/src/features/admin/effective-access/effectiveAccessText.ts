import type { AccessCandidate, AccessSource, EffectiveClusterAccess } from '@/shared/api';

/** Extra line of the winning candidate when the user's read-only flag narrowed it (contract §5, PREC-6). */
export const NARROWED_TEXT = "Narrowed to read-only by the user's read-only flag";

/** Placeholder for a missing value (a user grant's priority), as on the user Details tab. */
export const EMPTY = '—';

/** The Source column of Effective access (EFF-1): "Direct grant", or "Group `X` (priority N)" for a group grant. */
export function sourceText(source: AccessSource): string {
  if (source.kind === 'user') return 'Direct grant';
  return `Group ${source.groupName ?? EMPTY} (priority ${source.priority ?? EMPTY})`;
}

/**
 * Why a candidate grant won or lost (EFF-2) in the verbatim contract §5 copy, one entry per line: the winner
 * "Applies", plus {@link NARROWED_TEXT} when the row was narrowed by the user's read-only flag; a lower-priority
 * loser names the winning group (`beatenBy`).
 */
export function outcomeText(
  candidate: Pick<AccessCandidate, 'outcome' | 'beatenBy'>,
  row: Pick<EffectiveClusterAccess, 'narrowedByReadOnlyFlag'>,
): string[] {
  switch (candidate.outcome) {
    case 'winner':
      return row.narrowedByReadOnlyFlag ? ['Applies', NARROWED_TEXT] : ['Applies'];
    case 'overriddenByDirectGrant':
      return ['Overridden by direct grant'];
    case 'lowerPriority':
      return [`Lower priority than ${candidate.beatenBy ?? EMPTY}`];
    case 'tieReadOnlyWins':
      return ['Tie: read-only wins'];
    case 'tieBrokenById':
      return ['Tie: older grant wins'];
  }
}
