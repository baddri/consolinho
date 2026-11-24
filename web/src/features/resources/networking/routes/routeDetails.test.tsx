import { screen, within } from '@testing-library/react';
import type { Route } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { needsCustomDnsHelp, primaryIngress, trafficPercentage } from './routeTraffic';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

const ROUTES_URL = '/c/dev-1/k8s/ns/shop/routes';
const CANONICAL = 'router-default.apps.dev-1.example.com';

/** The details row (`DescriptionListGroup`) labelled `label` inside `scope`. */
function detailsRow(scope: HTMLElement, label: string): HTMLElement {
  const row = within(scope).getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

/** Opens route `name` and waits for its "Route details" section. */
async function openRoute(name: string): Promise<{ details: HTMLElement; user: ReturnType<typeof renderApp>['user'] }> {
  const { user } = renderApp(`${ROUTES_URL}/${name}`);
  const details = await screen.findByRole('region', { name: 'Route details' }, { timeout: COLD_START_TIMEOUT_MS });
  return { details, user };
}

describe('route details helpers', () => {
  const route: Route = {
    apiVersion: 'route.openshift.io/v1',
    kind: 'Route',
    metadata: { name: 'r', namespace: 'shop' },
    spec: {
      host: 'a.example.com',
      to: { kind: 'Service', name: 'a', weight: 3 },
      alternateBackends: [{ kind: 'Service', name: 'b', weight: 1 }],
    },
    status: {
      ingress: [
        { host: 'other.example.com', routerName: 'sharded' },
        {
          host: 'a.example.com',
          routerName: 'default',
          routerCanonicalHostname: 'router.example.com',
          conditions: [{ type: 'Admitted', status: 'True' }],
        },
      ],
    },
  };

  it('trafficPercentage divides by the summed weights; "-" without a weight', () => {
    expect(trafficPercentage(route, 3)).toBe('75.0%');
    expect(trafficPercentage(route, 1)).toBe('25.0%');
    expect(trafficPercentage(route, 0)).toBe('-');
    expect(trafficPercentage(route, undefined)).toBe('-');
  });

  it('primaryIngress is the router status for spec.host; custom DNS help only for admitted, custom hosts', () => {
    const ingress = primaryIngress(route);
    expect(ingress?.routerName).toBe('default');
    expect(needsCustomDnsHelp(route, ingress)).toBe(true);
    const generated = { ...route, metadata: { ...route.metadata, annotations: { 'openshift.io/host.generated': 'true' } } };
    expect(needsCustomDnsHelp(generated, ingress)).toBe(false);
    expect(needsCustomDnsHelp(route, route.status?.ingress?.[0])).toBe(false);
  });
});

describe('Route details (RT-3, RT-4)', () => {
  it(
    'web: location, status, service, TLS edge with certificates only as "Set", router status',
    async () => {
      const { details } = await openRoute('web');

      const link = within(detailsRow(details, 'Location')).getByRole('link', { name: /^https:\/\/web-shop/ });
      expect(link).toHaveAttribute('href', 'https://web-shop.apps.dev-1.example.com');
      expect(detailsRow(details, 'Status')).toHaveTextContent('Accepted');
      expect(detailsRow(details, 'Host')).toHaveTextContent('web-shop.apps.dev-1.example.com');
      expect(detailsRow(details, 'Path')).toHaveTextContent('-');
      expect(within(detailsRow(details, 'Service')).getByRole('link', { name: 'web' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/services/web',
      );
      expect(detailsRow(details, 'Target port')).toHaveTextContent('http');
      const canonical = detailsRow(details, 'Router canonical hostname');
      expect(canonical).toHaveTextContent(CANONICAL);
      expect(within(canonical).getByRole('button', { name: 'Do you need to set up custom DNS?' })).toBeInTheDocument();

      const tls = screen.getByRole('region', { name: 'TLS Settings' });
      expect(detailsRow(tls, 'Termination type')).toHaveTextContent('edge');
      expect(detailsRow(tls, 'Insecure traffic')).toHaveTextContent('Redirect');
      expect(detailsRow(tls, 'Certificate')).toHaveTextContent('Set');
      expect(detailsRow(tls, 'Key')).toHaveTextContent('Set');
      expect(detailsRow(tls, 'CA certificate')).toHaveTextContent('-');
      expect(within(tls).queryByText('Destination CA certificate')).toBeNull();

      expect(screen.queryByRole('region', { name: 'Traffic' })).toBeNull();
      const router = screen.getByRole('region', { name: 'Router: default' });
      expect(detailsRow(router, 'Host')).toHaveTextContent('web-shop.apps.dev-1.example.com');
      expect(detailsRow(router, 'Wildcard policy')).toHaveTextContent('None');
      expect(detailsRow(router, 'Router canonical hostname')).toHaveTextContent(CANONICAL);
      const conditions = within(router).getByRole('grid', { name: 'Conditions' });
      expect(within(conditions).getByText('Admitted')).toBeInTheDocument();
      expect(within(conditions).getByText('True')).toBeInTheDocument();

      // SAFE5-4: neither the PEM text nor its markers reach the DOM.
      expect(document.body.textContent).not.toMatch(/FAKE-CERT|FAKE-KEY|BEGIN (CERTIFICATE|PRIVATE KEY)/);
      expect(document.body.innerHTML).not.toMatch(/FAKE-CERT|FAKE-KEY/);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'RT-4: tabs Details, YAML, Events; actions are the common four',
    async () => {
      const { user } = await openRoute('web');

      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Details', 'YAML', 'Events']);
      await user.click(screen.getByRole('button', { name: 'Actions' }));
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Edit labels',
        'Edit annotations',
        'Edit Route',
        'Delete Route',
      ]);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'web-canary: no TLS, and a Traffic table with each backend weight and percent',
    async () => {
      const { details } = await openRoute('web-canary');

      expect(detailsRow(details, 'Path')).toHaveTextContent('/beta');
      expect(screen.getByRole('region', { name: 'TLS Settings' })).toHaveTextContent('TLS is not enabled.');
      const traffic = screen.getByRole('region', { name: 'Traffic' });
      expect(traffic).toHaveTextContent('This route splits traffic across multiple services.');
      const rows = within(within(traffic).getByRole('grid', { name: 'Traffic' }))
        .getAllByRole('row')
        .slice(1)
        .map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell, index) => (index === 0 ? within(cell).getByRole('link') : cell).textContent),
        );
      expect(rows).toEqual([
        ['web', '80', '80.0%'],
        ['web-canary', '20', '20.0%'],
      ]);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'pending: no router status yet, no canonical hostname',
    async () => {
      const { details } = await openRoute('pending');

      expect(detailsRow(details, 'Status')).toHaveTextContent('Pending');
      expect(within(details).queryByText('Router canonical hostname')).toBeNull();
      expect(screen.getByText('No route status')).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /^Router:/ })).toBeNull();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'rejected: the router condition says why, without custom DNS help',
    async () => {
      const { details } = await openRoute('rejected');

      expect(detailsRow(details, 'Status')).toHaveTextContent('Rejected');
      expect(within(details).queryByRole('button', { name: 'Do you need to set up custom DNS?' })).toBeNull();
      const conditions = within(screen.getByRole('region', { name: 'Router: default' })).getByRole('grid', {
        name: 'Conditions',
      });
      expect(within(conditions).getByText('HostAlreadyClaimed')).toBeInTheDocument();
      expect(
        within(conditions).getByText('route web-shop.apps.dev-1.example.com already claimed by another namespace'),
      ).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
