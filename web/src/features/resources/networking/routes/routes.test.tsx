import { screen, within } from '@testing-library/react';
import type { Route } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { routeWebUrl } from './RouteLocation';
import { routeHost, routeLabel, routeStatus } from './routeStatus';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** A route to Service `web` with the given spec overrides and router admissions (`True`/`False` per router). */
function route(spec: Partial<Route['spec']>, admissions?: ('True' | 'False')[]): Route {
  return {
    apiVersion: 'route.openshift.io/v1',
    kind: 'Route',
    metadata: { name: 'r', namespace: 'shop' },
    spec: { host: 'web.apps.example.com', to: { kind: 'Service', name: 'web' }, ...spec },
    ...(admissions === undefined
      ? {}
      : {
          status: {
            ingress: admissions.map((status, index) => ({
              host: `router${String(index)}.apps.example.com`,
              routerName: `router${String(index)}`,
              conditions: [{ type: 'Admitted', status }],
            })),
          },
        }),
  };
}

describe('routeStatus and routeHost', () => {
  it('is Accepted when any router admitted it, Rejected when one refused, else Pending', () => {
    expect(routeStatus(route({}, ['False', 'True']))).toBe('Accepted');
    expect(routeStatus(route({}, ['False']))).toBe('Rejected');
    expect(routeStatus(route({}, []))).toBe('Pending');
    expect(routeStatus(route({}))).toBe('Pending');
  });

  it('uses the admitting router host, else spec.host', () => {
    expect(routeHost(route({}, ['False', 'True']))).toBe('router1.apps.example.com');
    expect(routeHost(route({}, ['False']))).toBe('web.apps.example.com');
  });

  it('labels a wildcard route with its subdomain and the path', () => {
    expect(routeLabel(route({ host: 'www.wild.example.com', wildcardPolicy: 'Subdomain', path: '/x' }))).toBe(
      '*.wild.example.com/x',
    );
    expect(routeLabel(route({ host: undefined }))).toBeUndefined();
  });
});

describe('routeWebUrl (RT-2)', () => {
  it('links admitted routes, https only with spec.tls', () => {
    expect(routeWebUrl(route({ tls: { termination: 'edge' } }, ['True']))).toBe('https://router0.apps.example.com');
    expect(routeWebUrl(route({ path: '/beta' }, ['True']))).toBe('http://router0.apps.example.com/beta');
  });

  it('does not link pending, rejected, wildcard or unsafe routes', () => {
    expect(routeWebUrl(route({}))).toBeUndefined();
    expect(routeWebUrl(route({}, ['False']))).toBeUndefined();
    expect(routeWebUrl(route({ wildcardPolicy: 'Subdomain' }, ['True']))).toBeUndefined();
    expect(routeWebUrl(route({ path: '//evil.com' }, ['True']))).toBeUndefined();
  });
});

/** The table row whose name link points at route `name`. */
function rowOf(table: HTMLElement, name: string): HTMLElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) =>
      within(candidate)
        .queryAllByRole('link')
        .some((link) => link.getAttribute('href') === `/c/dev-1/k8s/ns/shop/routes/${name}`),
    );
  if (row === undefined) throw new Error(`no row for route ${name}`);
  return row;
}

describe('Routes list (RT-1)', () => {
  it('shows status, location and service of each route', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp('/c/dev-1/k8s/ns/shop/routes');

    const table = await screen.findByRole('grid', { name: 'Routes' }, { timeout: COLD_START_TIMEOUT_MS });
    await within(table).findByText('Pending', {}, { timeout: COLD_START_TIMEOUT_MS });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    for (const title of ['Name', 'Status', 'Location', 'Service']) {
      expect(headers.some((text) => text.startsWith(title))).toBe(true);
    }

    const web = rowOf(table, 'web');
    expect(within(web).getByText('Accepted')).toBeInTheDocument();
    const link = within(web).getByRole('link', { name: /^https:\/\/web-shop\.apps\.dev-1\.example\.com/ });
    expect(link).toHaveAttribute('href', 'https://web-shop.apps.dev-1.example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    const copy = within(web).getByRole('button', { name: 'Copy to clipboard' });
    const controlled = copy.getAttribute('aria-controls');
    expect(controlled && within(web).getByRole('link', { name: /^https:/ }).closest(`[id="${controlled}"]`)).toBeTruthy();
    const serviceLinks = within(web)
      .getAllByRole('link', { name: 'web' })
      .map((serviceLink) => serviceLink.getAttribute('href'));
    expect(serviceLinks).toContain('/c/dev-1/k8s/ns/shop/services/web');

    expect(within(rowOf(table, 'web-canary')).getByRole('link', { name: /^http:\/\/.*\/beta/ })).toHaveAttribute(
      'href',
      'http://web-canary-shop.apps.dev-1.example.com/beta',
    );

    const pending = rowOf(table, 'pending');
    expect(within(pending).getByText('Pending')).toBeInTheDocument();
    expect(within(pending).getByText('pending-shop.apps.dev-1.example.com')).toBeInTheDocument();
    expect(within(pending).queryByRole('button', { name: 'Copy to clipboard' })).toBeNull();

    const rejected = rowOf(table, 'rejected');
    expect(within(rejected).getByText('Rejected')).toBeInTheDocument();
    expect(within(rejected).getByText('web-shop.apps.dev-1.example.com')).toBeInTheDocument();

    const wildcard = rowOf(table, 'wildcard');
    expect(within(wildcard).getByText('*.wild.apps.dev-1.example.com')).toBeInTheDocument();
    expect(within(wildcard).queryByRole('link', { name: /^https?:/ })).toBeNull();
  });

  it('is not available on a Kubernetes cluster', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp('/c/prod-k8s-1/k8s/ns/shop/routes');

    expect(
      await screen.findByRole(
        'heading',
        { name: "Routes aren't available on prod-k8s-1", level: 1 },
        { timeout: COLD_START_TIMEOUT_MS },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Services', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Routes', hidden: true })).toBeNull();
  });
});
