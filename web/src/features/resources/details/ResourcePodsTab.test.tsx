import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import type { Deployment, K8sResource, Pod, Service } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../routes';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** Whether a column titled `title` is listed (header text also carries the resize handle's label). */
const hasColumn = (title: string) =>
  screen
    .getAllByRole('columnheader')
    .some((header) => new RegExp(`^${title}(Column|$)`).test(header.textContent));

/** Opens a workload's Pods tab and waits for the pod row. */
async function openPodsTab(path: string, podName: RegExp) {
  renderApp(`/c/dev-1/k8s/ns/shop/${path}/pods`);
  return screen.findByRole('row', { name: podName }, { timeout: COLD_START_TIMEOUT_MS });
}

describe('workload Pods tab Node column (OCP showNodes)', () => {
  it('shows Node instead of Owner on a DaemonSet', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const row = await openPodsTab('daemonsets/node-agent', /node-agent-h7x2k/);

    expect(hasColumn('Node')).toBe(true);
    expect(hasColumn('Owner')).toBe(false);
    expect(within(row).getByText('worker-1')).toBeInTheDocument();
  });

  it('shows Node instead of Owner on a Job', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const row = await openPodsTab('jobs/migrate-db', /migrate-db-/);

    expect(hasColumn('Node')).toBe(true);
    expect(hasColumn('Owner')).toBe(false);
    expect(within(row).getByText('worker-1')).toBeInTheDocument();
  });

  it.each([
    ['deployments/web', /web-7d4b9c8f6d-tq5wn/],
    ['statefulsets/db', /db-0/],
    ['replicasets/legacy-rs', /legacy-rs-5kq8d/],
    ['replicationcontrollers/legacy-rc', /legacy-rc-w2v6n/],
    ['deploymentconfigs/frontend', /frontend-2-7mxkq/],
  ])('keeps Owner on %s', { timeout: COLD_START_TEST_TIMEOUT_MS }, async (path, podName) => {
    await openPodsTab(path, podName);

    expect(hasColumn('Owner')).toBe(true);
    expect(hasColumn('Node')).toBe(false);
  });
});

/** `matchLabels` + `In` + `Exists`, as OCP `selectorToString` writes it. */
const EXPRESSION_SELECTOR = 'app=picky,env in (prod,stage),canary';

/** Deployment `picky` selecting by `matchExpressions`, one matching pod and two that only match `matchLabels`. */
function upsertExpressionDeployment() {
  const deployment: Deployment & K8sResource = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: 'picky', namespace: 'shop', uid: 'uid-picky' },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: { app: 'picky' },
        matchExpressions: [
          { key: 'env', operator: 'In', values: ['prod', 'stage'] },
          { key: 'canary', operator: 'Exists' },
        ],
      },
      template: { spec: { containers: [{ name: 'main', image: 'i' }] } },
    },
    status: { replicas: 1, readyReplicas: 1 },
  };
  mockK8s.upsert('dev-1', deployment);
  const pods: [string, Record<string, string>][] = [
    ['picky-match', { app: 'picky', env: 'prod', canary: 'true' }],
    ['picky-dev', { app: 'picky', env: 'dev', canary: 'true' }],
    ['picky-stable', { app: 'picky', env: 'prod' }],
  ];
  for (const [name, labels] of pods) {
    const pod: Pod & K8sResource = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name, namespace: 'shop', uid: `uid-${name}`, labels },
      spec: { containers: [{ name: 'main', image: 'i' }] },
      status: { phase: 'Running' },
    };
    mockK8s.upsert('dev-1', pod);
  }
}

/** Records the `labelSelector` of every pods list request. */
function recordPodSelectors(): string[] {
  const selectors: string[] = [];
  server.use(
    http.get('*/api/clusters/:cluster/k8s/*', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/pods')) selectors.push(url.searchParams.get('labelSelector') ?? '');
      return undefined;
    }),
  );
  return selectors;
}

describe('matchExpressions pod selectors (OCP selectorToString)', () => {
  it(
    'the Pods tab sends the full selector and lists only matching pods',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      upsertExpressionDeployment();
      const selectors = recordPodSelectors();

      await openPodsTab('deployments/picky', /picky-match/);

      expect(selectors).toContain(EXPRESSION_SELECTOR);
      expect(screen.queryByRole('row', { name: /picky-dev/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('row', { name: /picky-stable/ })).not.toBeInTheDocument();
    },
  );

  it(
    'the ring queries with it and the Pod selector link carries it',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      upsertExpressionDeployment();
      const selectors = recordPodSelectors();

      renderApp('/c/dev-1/k8s/ns/shop/deployments/picky');

      const link = await screen.findByRole(
        'link',
        { name: 'app=picky, env in (prod, stage), canary' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(link).toHaveAttribute(
        'href',
        `/c/dev-1/k8s/ns/shop/pods?${new URLSearchParams({ label: EXPRESSION_SELECTOR })}`,
      );
      await waitFor(() => expect(selectors).toContain(EXPRESSION_SELECTOR));
    },
  );
});

describe('Service Pods tab (SVC-1)', () => {
  it('lists exactly the pods matching the selector', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const selectors = recordPodSelectors();

    await openPodsTab('services/web', /web-7d4b9c8f6d-tq5wn/);

    expect(selectors).toContain('app=web');
    expect(screen.queryByRole('row', { name: /db-0/ })).not.toBeInTheDocument();
  });

  it(
    'shows the empty state for a selector-less service, never all pods',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const service: Service & K8sResource = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'external-db', namespace: 'shop', uid: 'uid-external-db' },
        spec: { type: 'ClusterIP', ports: [{ port: 5432 }] },
      };
      mockK8s.upsert('dev-1', service);
      const selectors = recordPodSelectors();

      renderApp('/c/dev-1/k8s/ns/shop/services/external-db/pods');

      expect(
        await screen.findByRole('heading', { name: 'No Pods found' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
      expect(selectors).toEqual([]);
    },
  );
});
