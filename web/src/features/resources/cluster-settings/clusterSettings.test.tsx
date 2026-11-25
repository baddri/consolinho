import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ClusterOperatorModel,
  type ClusterOperator,
  type ClusterVersion,
  type K8sCondition,
} from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../routes';
import { availableVersions, clusterUpdateView } from './clusterUpdateView';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

const slow = { timeout: COLD_START_TEST_TIMEOUT_MS };
const wait = { timeout: COLD_START_TIMEOUT_MS };

/** A ClusterVersion with the given conditions and available update versions. */
function cv(conditions: K8sCondition[], updates: string[] = []): ClusterVersion {
  return {
    apiVersion: 'config.openshift.io/v1',
    kind: 'ClusterVersion',
    metadata: { name: 'version' },
    spec: { clusterID: 'id', channel: 'stable-4.18' },
    status: {
      desired: { version: '4.18.12' },
      history: [{ state: 'Completed', version: '4.18.12', startedTime: '2026-01-01T00:00:00Z' }],
      availableUpdates: updates.map((version) => ({ version, image: `img@sha256:${version}` })),
      conditions,
    },
  };
}

/** Gives dev-1 the `dev-2` scenario (test users can't reach the disabled dev-2): `ingress` Degraded. */
function degradeIngressOnDev1() {
  const co = mockK8s.get('dev-1', ClusterOperatorModel, undefined, 'ingress') as ClusterOperator;
  const conditions = (co.status?.conditions ?? []).map((c) =>
    c.type === 'Degraded' ? { ...c, status: 'True' as const, message: 'Router pods are crashlooping' } : c,
  );
  const degraded: ClusterOperator = { ...co, status: { ...co.status, conditions } };
  mockK8s.upsert('dev-1', degraded);
}

const cond = (type: string, status: K8sCondition['status'], message?: string): K8sCondition => ({
  type,
  status,
  ...(message ? { message } : {}),
});

/** The text of the first cell of each body row of `table`. */
function firstCells(table: HTMLElement): (string | null)[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? null);
}

describe('clusterUpdateView (CS-2)', () => {
  it('maps each update scenario with its OCP message', () => {
    expect(clusterUpdateView(cv([cond('Failing', 'True', 'boom'), cond('Progressing', 'False')]))).toEqual({
      kind: 'failing',
      message: 'boom',
    });
    expect(
      clusterUpdateView({
        ...cv([cond('Progressing', 'True', 'Working towards 4.18.14')]),
        status: {
          ...cv([]).status,
          desired: { version: '4.18.14' },
          conditions: [cond('Progressing', 'True', 'Working towards 4.18.14')],
        },
      }),
    ).toMatchObject({ kind: 'updating', progress: 'Working towards 4.18.14' });
    expect(clusterUpdateView(cv([cond('Progressing', 'False')], ['4.18.14']))).toEqual({ kind: 'available' });
    expect(clusterUpdateView(cv([cond('Progressing', 'False')]))).toEqual({ kind: 'upToDate' });
  });

  it('sorts available versions newest first', () => {
    expect(availableVersions(cv([], ['4.18.9', '4.18.15', '4.19.2']))).toEqual([
      '4.19.2',
      '4.18.15',
      '4.18.9',
    ]);
  });
});

describe('Cluster Settings page (CS-1, CS-2)', () => {
  // alice holds the prod-eu-1 and staging-eu-1 grants.
  beforeEach(() => setMockUser('alice'));

  it(
    'shows version, channel, cluster ID, history and Available updates on prod-eu-1, without update buttons',
    slow,
    async () => {
      renderApp('/c/prod-eu-1/settings/cluster');
      expect(
        await screen.findByRole('heading', { name: 'Cluster Settings', level: 1 }, wait),
      ).toBeInTheDocument();
      expect(await screen.findByText('Available updates', {}, wait)).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getAllByText('4.18.12').length).toBeGreaterThan(0);
      expect(screen.getByText('stable-4.18')).toBeInTheDocument();
      expect(screen.getByText('Cluster ID')).toBeInTheDocument();
      const history = screen.getByRole('grid', { name: 'Update history' });
      expect(firstCells(history)).toContain('4.18.12');
      expect(screen.queryByRole('button', { name: /update|select a version/i })).not.toBeInTheDocument();
    },
  );

  it('shows the update in progress with its progress text on staging-eu-1', slow, async () => {
    renderApp('/c/staging-eu-1/settings/cluster');
    expect(await screen.findByText('Update to 4.18.14 in progress', {}, wait)).toBeInTheDocument();
    expect(screen.getByText(/512 of 873 done/)).toBeInTheDocument();
  });

  it('shows the not-served state on a Kubernetes cluster', slow, async () => {
    renderApp('/c/prod-k8s-1/settings/cluster');
    expect(
      await screen.findByRole('heading', { name: "Cluster Settings aren't available on prod-k8s-1" }, wait),
    ).toBeInTheDocument();
  });
});

describe('ClusterOperators (CS-3)', () => {
  beforeEach(degradeIngressOnDev1);

  it(
    'lists operators at their own tab URL and sorts Degraded first by Status with the dev-2 scenario',
    slow,
    async () => {
      renderApp('/c/dev-1/settings/cluster/clusteroperators');
      const table = await screen.findByRole('grid', { name: 'ClusterOperators' }, wait);
      expect(await within(table).findByRole('link', { name: 'ingress' }, wait)).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'ClusterOperators' })).toHaveAttribute('aria-selected', 'true');
      expect(within(table).queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
      for (const title of ['Name', 'Status', 'Version', 'Message']) {
        expect(
          within(table).getByRole('columnheader', { name: new RegExp(`^${title}`) }),
        ).toBeInTheDocument();
      }
      await userEvent.click(within(table).getByRole('button', { name: /^Status/ }));
      expect(firstCells(table)[0]).toMatch(/ingress$/);
      const ingressRow = within(table).getByRole('link', { name: 'ingress' }).closest('tr');
      expect(ingressRow).toHaveTextContent('Degraded');
    },
  );

  it(
    'shows details with Conditions and links back to the settings tab, without Edit/Delete',
    slow,
    async () => {
      renderApp('/c/dev-1/k8s/cluster/clusteroperators/ingress');
      expect(await screen.findByRole('heading', { name: 'Conditions' }, wait)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Operand versions' })).toBeInTheDocument();
      expect(screen.getAllByText('Degraded').length).toBeGreaterThan(0);
      expect(screen.queryByRole('tab', { name: 'Events' })).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Related objects' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
      // OCP `breadcrumbsFor`: back to the Cluster Settings tab, not the generic list (descriptor `listPath`).
      expect(
        within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', {
          name: 'ClusterOperators',
        }),
      ).toHaveAttribute('href', '/c/dev-1/settings/cluster/clusteroperators');
    },
  );

  it('links related objects the registry knows and shows the others as text', slow, async () => {
    renderApp('/c/dev-1/k8s/cluster/clusteroperators/ingress/related-objects');
    const table = await screen.findByRole('grid', { name: 'Related objects' }, wait);
    // Core `namespaces` has a descriptor: a link. `operator.openshift.io` ingresscontrollers has none: text.
    expect(within(table).getByRole('link', { name: 'openshift-ingress' })).toBeInTheDocument();
    expect(within(table).getByText('default')).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: 'default' })).not.toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'openshift-ingress-operator' })).toBeInTheDocument();
  });
});
