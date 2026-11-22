import { fleetAdminPath, perspectiveOf } from './perspective';

describe('perspectiveOf', () => {
  it.each([
    ['/fleet', 'fleet'],
    ['/fleet/', 'fleet'],
    ['/fleet/admin/x', 'fleet'],
    ['/fleetx', 'cluster'],
    ['/c/a', 'cluster'],
    ['/', 'cluster'],
  ])('%s is the %s perspective', (pathname, expected) => {
    expect(perspectiveOf(pathname)).toBe(expected);
  });
});

describe('fleetAdminPath', () => {
  it('builds paths under /fleet/admin', () => {
    expect(fleetAdminPath()).toBe('/fleet/admin');
    expect(fleetAdminPath('users/a%2Fb')).toBe('/fleet/admin/users/a%2Fb');
  });
});
