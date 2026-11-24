import { hostUrl } from './linkOut';

describe('hostUrl (RT-2)', () => {
  it('builds http or https URLs for valid hosts and paths', () => {
    expect(hostUrl({ host: 'web-shop.apps.dev-1.example.com', tls: true })).toBe(
      'https://web-shop.apps.dev-1.example.com',
    );
    expect(hostUrl({ host: 'web.example.com', path: '/beta', tls: false })).toBe('http://web.example.com/beta');
    expect(hostUrl({ host: 'web.example.com', path: '', tls: false })).toBe('http://web.example.com');
  });

  it.each([
    ['javascript:alert(1)'],
    ['//evil.com'],
    ['evil.com/..'],
    ['*.wild.apps.example.com'],
    ['Web.Example.com'],
    ['web.example.com.'],
    ['host@evil.com'],
    [''],
    ['-web.example.com'],
    ['web..example.com'],
    [`${'a'.repeat(64)}.example.com`],
    [`${'a.'.repeat(127)}com`],
  ])('rejects host %j', (host) => {
    expect(hostUrl({ host, tls: true })).toBeUndefined();
  });

  it('rejects a missing host', () => {
    expect(hostUrl({ tls: true })).toBeUndefined();
  });

  it.each([['//x'], ['x'], ['/a//b'], ['/a\\b'], ['/a b'], ['/a\nb'], ['/a\u0000b']])('rejects path %j', (path) => {
    expect(hostUrl({ host: 'web.example.com', path, tls: true })).toBeUndefined();
  });
});
