import { formatBinaryBytes, parseQuantity } from './quantity';

describe('parseQuantity', () => {
  it('parses binary, decimal, milli, exponent and plain quantities', () => {
    expect(parseQuantity('1.5Gi')).toBe(1.5 * 2 ** 30);
    expect(parseQuantity('10Gi')).toBe(10 * 2 ** 30);
    expect(parseQuantity('128Ki')).toBe(128 * 1024);
    expect(parseQuantity('2Ei')).toBe(2 * 2 ** 60);
    expect(parseQuantity('500M')).toBe(5e8);
    expect(parseQuantity('2k')).toBe(2000);
    expect(parseQuantity('100m')).toBeCloseTo(0.1);
    expect(parseQuantity('1e3')).toBe(1000);
    expect(parseQuantity('1E3')).toBe(1000);
    expect(parseQuantity('1024')).toBe(1024);
    expect(parseQuantity(' 4Gi ')).toBe(4 * 2 ** 30);
    expect(parseQuantity('.5')).toBe(0.5);
  });

  it('returns undefined for anything that is not a quantity', () => {
    expect(parseQuantity(undefined)).toBeUndefined();
    expect(parseQuantity('')).toBeUndefined();
    expect(parseQuantity('bogus')).toBeUndefined();
    expect(parseQuantity('10GB')).toBeUndefined();
    expect(parseQuantity('10 Gi')).toBeUndefined();
    expect(parseQuantity('1e3Gi')).toBeUndefined();
    expect(parseQuantity('Gi')).toBeUndefined();
  });
});

describe('formatBinaryBytes', () => {
  it('humanizes bytes as OCP humanizeBinaryBytes', () => {
    expect(formatBinaryBytes(10 * 2 ** 30)).toBe('10 GiB');
    expect(formatBinaryBytes(1.5 * 2 ** 30)).toBe('1.5 GiB');
    expect(formatBinaryBytes(5e8)).toBe('476.8 MiB');
    expect(formatBinaryBytes(512)).toBe('512 B');
    expect(formatBinaryBytes(1023.99 * 2 ** 20)).toBe('1 GiB');
    expect(formatBinaryBytes(0)).toBe('0 B');
    expect(formatBinaryBytes(Number.NaN)).toBe('0 B');
  });
});
