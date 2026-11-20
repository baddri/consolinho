import { clusterSwitchPath } from './clusterSwitchPath';

describe('clusterSwitchPath (SW-9)', () => {
  it.each([
    ['/c/a/ns/x/pods', '', '/c/b/ns/x/pods'],
    ['/c/a/ns/x/pods/my-pod', '', '/c/b/ns/x/pods/my-pod'],
    ['/c/a/cluster/nodes', '', '/c/b/cluster/nodes'],
    ['/c/a/overview', '', '/c/b/overview'],
    ['/c/dev-1/k8s/ns/shop/pods', '?label=app%3Dweb', '/c/b/k8s/ns/shop/pods?label=app%3Dweb'],
    ['/c/a', '', '/c/b'],
    ['/c/a/', '?q=1', '/c/b'],
    ['/admin/users', '?page=2', '/c/b'],
    ['/unknown', '', '/c/b'],
  ])('switching from %s%s goes to %s', (pathname, search, expected) => {
    expect(clusterSwitchPath({ pathname, search }, 'b')).toBe(expected);
  });

  it('encodes the target cluster name', () => {
    expect(clusterSwitchPath({ pathname: '/c/a/overview', search: '' }, 'a b')).toBe('/c/a%20b/overview');
  });
});
