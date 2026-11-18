import { clusterSwitchPath } from './clusterSwitchPath';

describe('clusterSwitchPath', () => {
  it.each([
    ['/c/a/ns/x/pods', '/c/b/ns/x/pods'],
    ['/c/a/ns/x/pods/my-pod', '/c/b/ns/x/pods/my-pod'],
    ['/c/a/cluster/nodes', '/c/b/cluster/nodes'],
    ['/c/a/overview', '/c/b/overview'],
    ['/c/a', '/c/b/overview'],
    ['/c/a/', '/c/b/overview'],
    ['/admin/users', '/c/b/overview'],
    ['/unknown', '/c/b/overview'],
  ])('switching from %s goes to %s', (from, expected) => {
    expect(clusterSwitchPath(from, 'b')).toBe(expected);
  });
});
