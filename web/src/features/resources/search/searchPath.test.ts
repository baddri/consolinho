import { describe, expect, it } from 'vitest';
import { DeploymentModel, NamespaceModel, PodModel } from '@/shared/k8s';
import { ALL_NAMESPACES } from '../paths';
import { searchPath } from './searchPath';

describe('searchPath', () => {
  it('builds the scope from the namespace', () => {
    expect(searchPath('dev-1')).toBe('/c/dev-1/search');
    expect(searchPath('dev-1', { namespace: ALL_NAMESPACES })).toBe('/c/dev-1/search/all-namespaces');
    expect(searchPath('dev-1', { namespace: 'shop' })).toBe('/c/dev-1/search/ns/shop');
  });

  it("preselects a kind and a label as OCP's label links (SRCH-4)", () => {
    expect(searchPath('dev-1', { namespace: 'shop', kinds: [DeploymentModel], labels: ['app=web'] })).toBe(
      '/c/dev-1/search/ns/shop?kind=apps~v1~Deployment&q=app%3Dweb',
    );
  });

  it('uses the core group for a core kind and all namespaces for a cluster-scoped one', () => {
    expect(searchPath('dev-1', { namespace: 'shop', kinds: [PodModel] })).toBe(
      '/c/dev-1/search/ns/shop?kind=core~v1~Pod',
    );
    expect(searchPath('dev-1', { namespace: ALL_NAMESPACES, kinds: [NamespaceModel], labels: ['env=prod'] })).toBe(
      '/c/dev-1/search/all-namespaces?kind=core~v1~Namespace&q=env%3Dprod',
    );
  });

  it('encodes keys with `/` and `.` and values with `=`, joining several with `,`', () => {
    const path = searchPath('dev-1', {
      namespace: 'shop',
      kinds: [DeploymentModel, PodModel],
      labels: ['app.kubernetes.io/name=web', 'note=a=b'],
    });
    expect(path).toBe(
      '/c/dev-1/search/ns/shop?kind=apps~v1~Deployment,core~v1~Pod&q=app.kubernetes.io%2Fname%3Dweb,note%3Da%3Db',
    );
    // The Search page reads them back with URLSearchParams and splits on `,`.
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('kind')?.split(',')).toEqual(['apps~v1~Deployment', 'core~v1~Pod']);
    expect(params.get('q')?.split(',')).toEqual(['app.kubernetes.io/name=web', 'note=a=b']);
  });

  it('keeps a given query string and adds the name', () => {
    expect(searchPath('dev-1', { namespace: 'shop', search: '?kind=core~v1~Pod' })).toBe(
      '/c/dev-1/search/ns/shop?kind=core~v1~Pod',
    );
    expect(searchPath('dev-1', { namespace: 'shop', name: 'web 1' })).toBe('/c/dev-1/search/ns/shop?name=web%201');
  });
});
