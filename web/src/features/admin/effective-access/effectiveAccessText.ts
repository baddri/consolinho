import type { AccessCandidate, AccessSource, EffectiveClusterAccess } from '@/shared/api';
import { DASH } from '@/shared/ui';

/** Extra line of the winning candidate when the user's read-only flag narrowed it (contract §5, PREC-6). */
export const NARROWED_TEXT = "Narrowed to read-only by the user's read-only flag";


/** The Source column of Effective access (EFF-1): "Direct grant", or "Group `X` (priority N)" for a group grant. */
export function sourceText(source: AccessSource): string {
  if (source.kind === 'user') return 'Direct grant';
  return `Group ${source.groupName ?? DASH} (priority ${source.priority ?? DASH})`;
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
      return [`Lower priority than ${candidate.beatenBy ?? DASH}`];
    case 'tieReadOnlyWins':
      return ['Tie: read-only wins'];
    case 'tieBrokenById':
      return ['Tie: older grant wins'];
  }
}
