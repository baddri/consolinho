import { formatRelativeTime } from './formatRelativeTime';

const NOW = new Date('2026-11-19T12:00:00Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it.each([
    [0, 'now'],
    [-30 * SECOND, '30 seconds ago'],
    [-5 * MINUTE, '5 minutes ago'],
    [-(5 * MINUTE + 50 * SECOND), '5 minutes ago'],
    [-2 * HOUR, '2 hours ago'],
    [-DAY, 'yesterday'],
    [-12 * DAY, '12 days ago'],
    [-65 * DAY, '2 months ago'],
    [-800 * DAY, '2 years ago'],
  ])('formats a past date %i ms away as "%s"', (offset, expected) => {
    expect(formatRelativeTime(at(offset), NOW)).toBe(expected);
  });

  it.each([
    [10 * SECOND, 'in 10 seconds'],
    [45 * MINUTE, 'in 45 minutes'],
    [DAY, 'tomorrow'],
    [3 * DAY, 'in 3 days'],
    // Truncated, never rounded up: an expiry 2 days 23 hours away is "in 2 days".
    [3 * DAY - HOUR, 'in 2 days'],
    [25 * DAY, 'in 25 days'],
    [400 * DAY, 'next year'],
  ])('formats a future date %i ms away as "%s"', (offset, expected) => {
    expect(formatRelativeTime(at(offset), NOW)).toBe(expected);
  });

  it('says "now" for sub-second differences in either direction', () => {
    expect(formatRelativeTime(at(-400), NOW)).toBe('now');
    expect(formatRelativeTime(at(400), NOW)).toBe('now');
  });
});
