import { screen, within } from '@testing-library/react';
import type { NetworkPolicy } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { affectsDirection, isDenyAll, peerRows, policyRules, portLabel } from './policyRules';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

const POLICIES_URL = '/c/dev-1/k8s/ns/shop/networkpolicies';

/** A NetworkPolicy with the given spec. */
function policy(spec: NetworkPolicy['spec']): NetworkPolicy {
  return { apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: { name: 'p' }, spec };
}

/** The text of each body row of `table`, cell by cell. */
function bodyRows(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    );
}

describe('policyRules (QG5A-1)', () => {
  const web = { matchLabels: { app: 'web' } };
  const infra = { matchLabels: { tier: 'infra' } };

  it('maps each peer shape, empty selectors included', () => {
    const np = policy({
      podSelector: {},
      ingress: [
        {
          from: [
            { podSelector: web },
            { podSelector: {}, namespaceSelector: infra },
            { namespaceSelector: {} },
            { ipBlock: { cidr: '10.0.0.0/16', except: ['10.0.5.0/24'] } },
            { ipBlock: { cidr: '192.168.0.0/24' } },
          ],
        },
        {},
      ],
    });
    expect(policyRules(np, 'ingress')).toEqual([
      {
        peers: [
          { kind: 'pods', podSelector: web },
          { kind: 'pods', podSelector: {}, namespaceSelector: infra },
          { kind: 'namespaces', namespaceSelector: {} },
          { kind: 'ipBlock', cidr: '10.0.0.0/16', except: ['10.0.5.0/24'] },
          { kind: 'ipBlock', cidr: '192.168.0.0/24', except: [] },
        ],
        ports: [],
      },
      { peers: [], ports: [] },
    ]);
    expect(policyRules(np, 'egress')).toEqual([]);
  });

  it('merges IP blocks into one row and reads a rule without peers as one "any peer" row', () => {
    const [rule] = policyRules(
      policy({
        podSelector: {},
        ingress: [{ from: [{ ipBlock: { cidr: 'a' } }, { podSelector: web }, { ipBlock: { cidr: 'b' } }] }],
      }),
      'ingress',
    );
    expect(peerRows(rule?.peers ?? [])).toEqual([
      [{ kind: 'pods', podSelector: web }],
      [
        { kind: 'ipBlock', cidr: 'a', except: [] },
        { kind: 'ipBlock', cidr: 'b', except: [] },
      ],
    ]);
    expect(peerRows([])).toEqual([[]]);
  });

  it('labels ports as protocol/port with TCP default, named ports and endPort ranges', () => {
    expect(portLabel({ port: 8080 })).toBe('TCP/8080');
    expect(portLabel({ port: 53, protocol: 'UDP' })).toBe('UDP/53');
    expect(portLabel({ port: 'http' })).toBe('TCP/http');
    expect(portLabel({ port: 32000, endPort: 32768 })).toBe('TCP/32000-32768');
    expect(portLabel({ protocol: 'SCTP' })).toBe('SCTP');
    const egress = policy({
      podSelector: {},
      policyTypes: ['Egress'],
      egress: [{ to: [{ podSelector: web }], ports: [{ port: 5432 }] }],
    });
    expect(policyRules(egress, 'egress')).toEqual([
      { peers: [{ kind: 'pods', podSelector: web }], ports: ['TCP/5432'] },
    ]);
  });

  it('detects deny-all in both directions', () => {
    const both = policy({ podSelector: {}, policyTypes: ['Ingress', 'Egress'] });
    expect(isDenyAll(both, 'ingress')).toBe(true);
    expect(isDenyAll(both, 'egress')).toBe(true);
    const egressOnly = policy({ podSelector: {}, policyTypes: ['Egress'], egress: [] });
    expect(isDenyAll(egressOnly, 'ingress')).toBe(false);
    expect(isDenyAll(egressOnly, 'egress')).toBe(true);
    const allowing = policy({ podSelector: {}, policyTypes: ['Ingress'], ingress: [{}] });
    expect(isDenyAll(allowing, 'ingress')).toBe(false);
  });

  it('implies Ingress, and Egress only with egress rules, when policyTypes is absent', () => {
    const bare = policy({ podSelector: {} });
    expect(affectsDirection(bare, 'ingress')).toBe(true);
    expect(isDenyAll(bare, 'ingress')).toBe(true);
    expect(affectsDirection(bare, 'egress')).toBe(false);
    expect(isDenyAll(bare, 'egress')).toBe(false);
    const withEgress = policy({ podSelector: {}, egress: [] });
    expect(affectsDirection(withEgress, 'egress')).toBe(true);
    expect(isDenyAll(withEgress, 'egress')).toBe(true);
  });
});

describe('NetworkPolicies list (NP-1)', () => {
  it(
    'shows the OCP columns and "All pods within" for the empty selector',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp(POLICIES_URL);

      const table = await screen.findByRole(
        'grid',
        { name: 'NetworkPolicies' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const allPods = await within(table).findByRole(
        'link',
        { name: 'All pods within shop' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(allPods).toHaveAttribute('href', '/c/dev-1/search/ns/shop?kind=core~v1~Pod');
      expect(within(table).getByRole('link', { name: 'app=web' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/pods?label=app%3Dweb',
      );
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent);
      for (const title of ['Name', 'Pod selector']) {
        expect(headers.some((text) => text.startsWith(title))).toBe(true);
      }
      expect(headers.some((text) => text.startsWith('Created'))).toBe(false);
    },
  );
});

describe('NetworkPolicy details (NP-2)', () => {
  it(
    'shows a namespace and pod selector peer with its port',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp(`${POLICIES_URL}/allow-web-from-router`);

      const section = await screen.findByRole(
        'region',
        { name: 'Ingress rules' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const rules = within(section).getByRole('grid', { name: 'Ingress rules' });
      expect(bodyRows(rules)).toEqual([
        [
          'Pod selectorapp=web',
          'NS selectornetwork.openshift.io/policy-group=ingressPod selectoringresscontroller.operator.openshift.io/deployment-ingresscontroller=default',
          'TCP/8080',
        ],
      ]);
      expect(
        within(rules).getByRole('link', { name: 'network.openshift.io/policy-group=ingress' }),
      ).toHaveAttribute(
        'href',
        '/c/dev-1/search/all-namespaces?kind=core~v1~Namespace&q=network.openshift.io%2Fpolicy-group%3Dingress',
      );
      // The peer's pod selector spans namespaces: Search for Pods in all of them, as OCP `Selector`.
      expect(within(rules).getByRole('link', { name: /ingresscontroller/ })).toHaveAttribute(
        'href',
        '/c/dev-1/search/all-namespaces?kind=core~v1~Pod&q=ingresscontroller.operator.openshift.io%2Fdeployment-ingresscontroller%3Ddefault',
      );
      expect(screen.getByRole('region', { name: 'Egress rules' })).toBeInTheDocument();
    },
  );

  it(
    'shows an IP block with its exceptions on the egress table',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp(`${POLICIES_URL}/db-egress`);

      const section = await screen.findByRole(
        'region',
        { name: 'Egress rules' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(screen.queryByRole('region', { name: 'Ingress rules' })).toBeNull();
      const rules = within(section).getByRole('grid', { name: 'Egress rules' });
      expect(bodyRows(rules)).toEqual([
        ['Pod selectorapp=db', 'IP blocks10.0.0.0/16 (with exceptions) ', 'TCP/5432'],
      ]);
      await user.hover(within(rules).getByText(/with exceptions/));
      expect(await screen.findByText('Exceptions: 10.0.5.0/24')).toBeInTheDocument();
    },
  );

  it('states the deny-all sentence', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    renderApp(`${POLICIES_URL}/deny-all-ingress`);

    const section = await screen.findByRole(
      'region',
      { name: 'Ingress rules' },
      { timeout: COLD_START_TIMEOUT_MS },
    );
    expect(within(section).getByText('All incoming traffic is denied to Pods in shop')).toBeInTheDocument();
    expect(within(section).queryByRole('grid')).toBeNull();
    const details = screen.getByRole('region', { name: 'NetworkPolicy details' });
    expect(within(details).getByRole('link', { name: 'All pods within shop' })).toBeInTheDocument();
    expect(within(details).getByText('Ingress', { selector: 'dd *, dd' })).toBeInTheDocument();
  });
});
