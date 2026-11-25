import { screen, within } from '@testing-library/react';
import type { Ingress } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../../routes';
import { ingressClass, ingressRuleRows, loadBalancerAddresses } from './ingressRules';

beforeAll(() => preloadLazyRoutes(resourceRoutes));
afterEach(() => server.events.removeAllListeners());

const INGRESSES_URL = '/c/dev-1/k8s/ns/shop/ingresses';

/** An Ingress with the given spec and annotations. */
function ingress(spec: Ingress['spec'], annotations?: Record<string, string>): Ingress {
  return { apiVersion: 'networking.k8s.io/v1', kind: 'Ingress', metadata: { name: 'i', annotations }, spec };
}

/** The details row (`DescriptionListGroup`) labelled `label` inside `scope`. */
function detailsRow(scope: HTMLElement, label: string): HTMLElement {
  const row = within(scope).getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

/** The text of each body row of `table`, cell by cell. */
function bodyRows(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        // A ResourceLink cell reads as its link text, without the kind badge.
        .map((cell) => (within(cell).queryAllByRole('link')[0] ?? cell).textContent),
    );
}

describe('ingress helpers', () => {
  it('serves a host over https when an exact or one-label wildcard TLS host covers it', () => {
    const backend = { service: { name: 'web', port: { number: 80 } } };
    const rule = (host: string) => ({ host, http: { paths: [{ path: '/', pathType: 'Prefix', backend }] } });
    const rows = ingressRuleRows(
      ingress({ tls: [{ hosts: ['*.example.com'] }], rules: [rule('a.example.com'), rule('a.b.example.com')] }),
    );
    expect(rows.map((row) => row.tls)).toEqual([true, false]);
  });

  it('reads the class from spec, else the legacy annotation; load balancer hostnames or IPs', () => {
    expect(ingressClass(ingress({}, { 'kubernetes.io/ingress.class': 'nginx' }))).toBe('nginx');
    expect(ingressClass(ingress({ ingressClassName: 'x' }, { 'kubernetes.io/ingress.class': 'nginx' }))).toBe('x');
    const balanced = { ...ingress({}), status: { loadBalancer: { ingress: [{ ip: '10.0.0.1' }, { hostname: 'lb' }] } } };
    expect(loadBalancerAddresses(balanced)).toEqual(['10.0.0.1', 'lb']);
  });

  it('routes a rule without paths, or no rules at all, to the default backend', () => {
    const defaultBackend = { service: { name: 'fallback', port: { name: 'http' } } };
    expect(ingressRuleRows(ingress({ defaultBackend, rules: [{ host: 'a.example.com' }] }))).toEqual([
      { host: 'a.example.com', tls: false, path: '*', serviceName: 'fallback', servicePort: 'http' },
    ]);
    expect(ingressRuleRows(ingress({ defaultBackend }))).toEqual([
      { host: '*', tls: false, path: '*', serviceName: 'fallback', servicePort: 'http' },
    ]);
    expect(ingressRuleRows(ingress({}))).toEqual([]);
  });
});

describe('Ingresses list (ING-1)', () => {
  it('shows every host on one truncated line, with the OCP columns', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp(INGRESSES_URL);

    const table = await screen.findByRole('grid', { name: 'Ingresses' }, { timeout: COLD_START_TIMEOUT_MS });
    const hosts = 'shop.example.com, www.shop.example.com';
    const cell = await within(table).findByText(hosts, {}, { timeout: COLD_START_TIMEOUT_MS });
    expect(cell).toHaveAttribute('title', hosts);
    expect(cell).toHaveClass('pf-v6-u-text-truncate');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    for (const title of ['Name', 'Labels', 'Hosts']) {
      expect(headers.some((text) => text.startsWith(title))).toBe(true);
    }
    expect(headers.some((text) => text.startsWith('Created'))).toBe(false);
  });
});

describe('Ingress details (ING-2, SAFE5-4)', () => {
  it(
    'shows class, load balancer, rules with host link-outs and the TLS secret by name only',
    async () => {
      const requested: string[] = [];
      server.events.on('request:start', ({ request }) => {
        requested.push(new URL(request.url).pathname);
      });
      renderApp(`${INGRESSES_URL}/shop-ingress`);

      const details = await screen.findByRole(
        'region',
        { name: 'Ingress details' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(detailsRow(details, 'Ingress class')).toHaveTextContent('openshift-default');
      expect(detailsRow(details, 'Load balancer')).toHaveTextContent('router-default.apps.example.com');
      expect(within(detailsRow(details, 'TLS certificate')).getByRole('link', { name: 'shop-tls' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/secrets/shop-tls',
      );

      const rules = within(screen.getByRole('region', { name: 'Ingress rules' })).getByRole('grid', {
        name: 'Ingress rules',
      });
      expect(bodyRows(rules)).toEqual([
        ['shop.example.com', '/', 'Prefix', 'web', '8080'],
        ['shop.example.com', '/api', 'Prefix', 'web', '8080'],
        ['www.shop.example.com', '/', 'Exact', 'web', '8080'],
      ]);
      const hostLinks = within(rules).getAllByRole('link', { name: /shop\.example\.com/ });
      expect(hostLinks.map((link) => link.getAttribute('href'))).toEqual([
        'https://shop.example.com/',
        'https://shop.example.com/api',
        'https://www.shop.example.com/',
      ]);
      expect(hostLinks[0]).toHaveAttribute('target', '_blank');
      expect(hostLinks[0]).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(rules).getAllByRole('link', { name: 'web' })[0]).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/services/web',
      );

      const tls = within(screen.getByRole('region', { name: 'TLS' })).getByRole('grid', { name: 'TLS' });
      expect(bodyRows(tls)).toEqual([['shop.example.com, www.shop.example.com', 'shop-tls']]);
      expect(within(tls).getByRole('link', { name: 'shop-tls' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/secrets/shop-tls',
      );

      // SAFE5-4: the Secret is never requested and none of its data reaches the DOM.
      expect(requested.some((path) => path.includes('/secrets'))).toBe(false);
      expect(document.body.innerHTML).not.toMatch(/FAKE-CERT|FAKE-KEY|BEGIN (CERTIFICATE|PRIVATE KEY)/);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
