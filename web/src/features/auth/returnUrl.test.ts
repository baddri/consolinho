import { buildLoginUrl, sanitizeReturnUrl } from './returnUrl';

describe('sanitizeReturnUrl (AUTH-2)', () => {
  it.each([
    'https://evil',
    'http://evil.example/c/prod',
    '//evil',
    '///evil',
    '/\\evil',
    '\\\\evil',
    'javascript:alert(1)',
    'evil/path',
    '/%0d%0aSet-Cookie',
    '/c/x\n',
    '/%5Cevil',
    '/%2F%2Fevil',
    '/%E0%A4%A',
    '/login',
    '/login?x',
    '/login/',
    '/LOGIN#top',
    '/%6Cogin',
    '',
    null,
    undefined,
  ])('rejects %j', (value) => {
    expect(sanitizeReturnUrl(value)).toBe('/');
  });

  it.each([
    '/',
    '/c/prod-eu-1/overview',
    '/c/prod-eu-1/ns/default/pods?x=1',
    '/c/dev-1/ns/default/pods/web-1#yaml',
    '/admin/users/alice%40corp',
    '/admin/audit?actor=alice&range=7d',
    '/loginhelp',
  ])('keeps the local path %j', (value) => {
    expect(sanitizeReturnUrl(value)).toBe(value);
  });
});

describe('buildLoginUrl', () => {
  it('encodes the return URL as a query parameter of the Api login endpoint', () => {
    expect(buildLoginUrl('/c/prod-eu-1/ns/default/pods?x=1')).toBe(
      '/api/auth/login?returnUrl=%2Fc%2Fprod-eu-1%2Fns%2Fdefault%2Fpods%3Fx%3D1',
    );
  });

  it.each([undefined, null, '//evil', '/login?loggedOut=1'])('falls back to / for %j', (value) => {
    expect(buildLoginUrl(value)).toBe('/api/auth/login?returnUrl=%2F');
  });
});
