import { formatVersion } from './formatVersion';

describe('formatVersion', () => {
  it('cuts a full 40-character commit SHA to 7 characters', () => {
    expect(formatVersion('1.0.0+dc5aff8da720c3d4249989d27d74a6aa9435ea6b')).toEqual({
      short: '1.0.0+dc5aff8',
      full: '1.0.0+dc5aff8da720c3d4249989d27d74a6aa9435ea6b',
      isAbbreviated: true,
    });
  });

  it('keeps a pre-release label while shortening the SHA', () => {
    expect(formatVersion('1.2.0-rc.1+DC5AFF8DA720C3D4').short).toBe('1.2.0-rc.1+DC5AFF8');
  });

  it('leaves a plain version unabbreviated', () => {
    expect(formatVersion('9.9.9')).toEqual({ short: '9.9.9', full: '9.9.9', isAbbreviated: false });
  });

  it('keeps an already short SHA and non-hash build metadata unchanged', () => {
    expect(formatVersion('1.0.0+dc5aff8')).toMatchObject({ short: '1.0.0+dc5aff8', isAbbreviated: false });
    expect(formatVersion('1.0.0+build.5')).toMatchObject({ short: '1.0.0+build.5', isAbbreviated: false });
  });

  it('keeps non-semver values such as 0.0.0-test readable', () => {
    expect(formatVersion('0.0.0-test').short).toBe('0.0.0-test');
  });

  it('trims whitespace and returns an empty version untouched', () => {
    expect(formatVersion('  1.0.0 ').full).toBe('1.0.0');
    expect(formatVersion('')).toEqual({ short: '', full: '', isAbbreviated: false });
  });
});
