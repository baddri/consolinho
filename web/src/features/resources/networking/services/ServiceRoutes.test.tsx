import { screen, within } from '@testing-library/react';
import type { Route } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { routesForService } from './ServiceRoutes';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** A route named `name` to `to`, with optional alternate backends. */
function route(name: string, to: Route['spec']['to'], alternateBackends?: Route['spec']['alternateBackends']): Route {
  return {
    apiVersion: 'route.openshift.io/v1',
    kind: 'Route',
    metadata: { name, namespace: 'shop' },
    spec: { to, ...(alternateBackends ? { alternateBackends } : {}) },
  };
}

describe('routesForService', () => {
  const routes = [
    route('primary', { kind: 'Service', name: 'web' }),
    route('split', { kind: 'Service', name: 'api' }, [{ kind: 'Service', name: 'web', weight: 20 }]),
    route('other', { kind: 'Service', name: 'api' }),
    route('not-a-service', { kind: 'Deployment', name: 'web' }, [{ kind: 'Pod', name: 'web' }]),
  ];

  it('matches spec.to and spec.alternateBackends of kind Service by name', () => {
    expect(routesForService(routes, 'web').map((r) => r.metadata.name)).toEqual(['primary', 'split']);
  });

  it('ignores other kinds and names', () => {
    expect(routesForService(routes, 'db')).toEqual([]);
    expect(routesForService(routes, 'api').map((r) => r.metadata.name)).toEqual(['split', 'other']);
  });
});

/** The Details tab's value of `term` (terms and values pair up in order), or `undefined`. */
function detailsValue(term: string): HTMLElement | undefined {
  const index = screen.getAllByRole('term').findIndex((element) => element.textContent === term);
  return index < 0 ? undefined : screen.getAllByRole('definition')[index];
}

describe('Service Routes item (SVC-2)', () => {
  it('links the routes sending traffic to the service', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp('/c/dev-1/k8s/ns/shop/services/web');

    const link = await screen.findByRole('link', { name: 'web-canary' }, { timeout: COLD_START_TIMEOUT_MS });
    const value = detailsValue('Routes');
    if (value === undefined) throw new Error('no Routes item');
    expect(within(value).getByRole('link', { name: 'web-canary' })).toBe(link);
    expect(link).toHaveAttribute('href', '/c/dev-1/k8s/ns/shop/routes/web-canary');
    expect(within(value).getByRole('link', { name: 'web' })).toHaveAttribute(
      'href',
      '/c/dev-1/k8s/ns/shop/routes/web',
    );
  });

  it('is absent on a Kubernetes cluster', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp('/c/prod-k8s-1/k8s/ns/shop/services/web');

    await screen.findByText('Session affinity', {}, { timeout: COLD_START_TIMEOUT_MS });
    expect(detailsValue('Routes')).toBeUndefined();
  });
});
