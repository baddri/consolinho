import type { AccessCandidateOutcome } from '@/shared/api';
import { NARROWED_TEXT, outcomeText, sourceText } from './effectiveAccessText';

describe('sourceText (EFF-1)', () => {
  it('names a direct grant or the winning group with its priority', () => {
    expect(sourceText({ kind: 'user', groupName: null, priority: null })).toBe('Direct grant');
    expect(sourceText({ kind: 'group', groupName: 'platform', priority: 100 })).toBe('Group platform (priority 100)');
  });
});

describe('outcomeText (EFF-2, contract §5 copy)', () => {
  const plain = { narrowedByReadOnlyFlag: false };

  it.each<[AccessCandidateOutcome, string | null, string[]]>([
    ['winner', null, ['Applies']],
    ['overriddenByDirectGrant', null, ['Overridden by direct grant']],
    ['lowerPriority', 'sre', ['Lower priority than sre']],
    ['tieReadOnlyWins', 'sre', ['Tie: read-only wins']],
    ['tieBrokenById', 'sre', ['Tie: older grant wins']],
  ])('%s', (outcome, beatenBy, expected) => {
    expect(outcomeText({ outcome, beatenBy }, plain)).toEqual(expected);
  });

  it("adds the read-only flag line to the winner of a narrowed row only", () => {
    const narrowed = { narrowedByReadOnlyFlag: true };
    expect(outcomeText({ outcome: 'winner', beatenBy: null }, narrowed)).toEqual(['Applies', NARROWED_TEXT]);
    expect(NARROWED_TEXT).toBe("Narrowed to read-only by the user's read-only flag");
    expect(outcomeText({ outcome: 'overriddenByDirectGrant', beatenBy: null }, narrowed)).toEqual([
      'Overridden by direct grant',
    ]);
  });
});
