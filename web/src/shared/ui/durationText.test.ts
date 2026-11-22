import { durationText } from './formatTimestamp';

describe('durationText (OCP fromNow omitSuffix)', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  it.each([
    ['2026-11-19T11:00:00Z', '3 days'],
    ['2026-11-22T11:00:00Z', '1 hour'],
    ['2026-11-22T11:58:30Z', '1 minute'],
    ['2026-11-22T11:59:30Z', '0 minutes'],
    ['2026-11-22T12:01:00Z', '-'],
    ['not a date', '-'],
  ])('%s → %s', (value, text) => {
    expect(durationText(new Date(value), now)).toBe(text);
  });
});
