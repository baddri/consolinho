import { ConfigMapModel, NamespaceModel } from '@/shared/k8s';
import { ALL_NAMESPACES, resourcePath } from './paths';

describe('resourcePath', () => {
  it.each([
    [ConfigMapModel, {}, '/c/dev-1/k8s/configmaps'],
    [ConfigMapModel, { namespace: ALL_NAMESPACES }, '/c/dev-1/k8s/all-namespaces/configmaps'],
    [ConfigMapModel, { namespace: 'shop' }, '/c/dev-1/k8s/ns/shop/configmaps'],
    [ConfigMapModel, { namespace: 'shop', name: 'web-config' }, '/c/dev-1/k8s/ns/shop/configmaps/web-config'],
    [
      ConfigMapModel,
      { namespace: 'shop', name: 'a', tab: 'yaml' as const },
      '/c/dev-1/k8s/ns/shop/configmaps/a/yaml',
    ],
    [
      ConfigMapModel,
      { namespace: 'shop', search: 'label=app%3Dweb' },
      '/c/dev-1/k8s/ns/shop/configmaps?label=app%3Dweb',
    ],
    [
      ConfigMapModel,
      { namespace: ALL_NAMESPACES, search: '?name=x' },
      '/c/dev-1/k8s/all-namespaces/configmaps?name=x',
    ],
    [ConfigMapModel, { search: '?' }, '/c/dev-1/k8s/configmaps'],
    [NamespaceModel, {}, '/c/dev-1/k8s/cluster/namespaces'],
    [
      NamespaceModel,
      { namespace: 'ignored', name: 'shop', tab: 'events' as const },
      '/c/dev-1/k8s/cluster/namespaces/shop/events',
    ],
  ])('%#: builds %s', (model, options, expected) => {
    expect(resourcePath('dev-1', model, options)).toBe(expected);
  });

  it('encodes every segment', () => {
    expect(resourcePath('a b', ConfigMapModel, { namespace: 'n/s', name: 'x?y' })).toBe(
      '/c/a%20b/k8s/ns/n%2Fs/configmaps/x%3Fy',
    );
  });
});
