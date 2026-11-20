import { isTimeRange, resolveRange } from './timeRange';

const NOW = Date.parse('2026-11-20T12:00:00.000Z');

describe('resolveRange (AUD-4)', () => {
  it.each([
    ['1h', '2026-11-20T11:00:00.000Z'],
    ['24h', '2026-11-19T12:00:00.000Z'],
    ['7d', '2026-11-13T12:00:00.000Z'],
    ['30d', '2026-10-21T12:00:00.000Z'],
  ])('preset %s sends from = now − range and no upper bound', (range, from) => {
    expect(resolveRange(range, undefined, undefined, NOW)).toEqual({ from });
  });

  it('ignores stray from/to with a preset', () => {
    expect(resolveRange('1h', '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z', NOW)).toEqual({
      from: '2026-11-20T11:00:00.000Z',
    });
  });

  it('custom passes both bounds through unchanged (the server validates them)', () => {
    expect(resolveRange('custom', '2026-11-01T00:00:00.000Z', 'not-a-date', NOW)).toEqual({
      from: '2026-11-01T00:00:00.000Z',
      to: 'not-a-date',
    });
    expect(resolveRange('custom', undefined, undefined, NOW)).toEqual({});
  });

  it('no range: all time, but explicit bounds of a hand-written link still apply', () => {
    expect(resolveRange(undefined, undefined, undefined, NOW)).toEqual({});
    expect(resolveRange(undefined, '2026-11-01T00:00:00.000Z', undefined, NOW)).toEqual({
      from: '2026-11-01T00:00:00.000Z',
    });
    expect(resolveRange('bogus', undefined, '2026-11-02T00:00:00.000Z', NOW)).toEqual({
      to: '2026-11-02T00:00:00.000Z',
    });
  });

  it('isTimeRange narrows URL values', () => {
    expect(isTimeRange('7d')).toBe(true);
    expect(isTimeRange('custom')).toBe(true);
    expect(isTimeRange('2d')).toBe(false);
    expect(isTimeRange(undefined)).toBe(false);
  });
});
