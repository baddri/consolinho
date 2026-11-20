import { proxyOutcome } from './proxyOutcome';

describe('proxyOutcome', () => {
  it('labels allowed entries with the status code: green 2xx, grey 0, red otherwise', () => {
    expect(proxyOutcome({ details: { outcome: 'allowed', statusCode: 201, reason: null } })).toEqual({
      label: '201',
      color: 'green',
    });
    expect(proxyOutcome({ details: { outcome: 'allowed', statusCode: 409 } })).toEqual({
      label: '409',
      color: 'red',
    });
    expect(proxyOutcome({ details: { outcome: 'allowed', statusCode: 0 } })?.color).toBe('grey');
  });

  it('labels denials with the reason text', () => {
    expect(
      proxyOutcome({ details: { outcome: 'denied', statusCode: 403, reason: 'readOnlyGrant' } }),
    ).toEqual({
      label: 'Denied — read-only grant',
      color: 'red',
    });
    expect(proxyOutcome({ details: { outcome: 'denied', reason: 'userReadOnly' } })?.label).toBe(
      'Denied — read-only user',
    );
    expect(proxyOutcome({ details: { outcome: 'denied', reason: 'somethingNew' } })?.label).toBe('Denied');
  });

  it('gives no label for details it cannot read', () => {
    expect(proxyOutcome({ details: null })).toBeUndefined();
    expect(proxyOutcome({ details: { reason: 'deactivated' } })).toBeUndefined();
    expect(proxyOutcome({ details: { outcome: 'allowed' } })).toBeUndefined();
  });
});
