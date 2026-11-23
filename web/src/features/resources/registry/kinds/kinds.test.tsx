import { screen, waitFor, within } from '@testing-library/react';
import { setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { descriptorForPlural } from '../registry';

const WEB_PODS = ['web-7d4b9c8f6d-2xkqp', 'web-7d4b9c8f6d-8mzrt', 'web-7d4b9c8f6d-tq5wn'];
const PODS_OF_WEB = '/c/dev-1/k8s/ns/shop/pods?label=app%3Dweb';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

function columnHeaders(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('columnheader')
    .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
}

/** The term texts of a details `DescriptionList`, in order. */
function terms(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('term')
    .map((term) => term.textContent);
}

/** The table row whose name link is `name` (the first such link: an HPA's scale target can share the name). */
async function findRow(table: HTMLElement, name: string): Promise<HTMLElement> {
  const [link] = await within(table).findAllByRole('link', { name });
  const row = link?.closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

/** The cell of `row` under the column header `column`. */
function cell(row: HTMLElement, column: string): HTMLElement {
  const table = row.closest<HTMLElement>('[role="grid"]');
  if (!table) throw new Error('row outside a grid');
  const index = columnHeaders(table).indexOf(column);
  const found = within(row).getAllByRole('cell')[index];
  if (index < 0 || !found) throw new Error(`no ${column} cell`);
  return found;
}

/** Gives `admin` a grant on lab-1 (fixtures grant only dev-1). */
function grantAdminOnLab1(): void {
  mockDb.credentials.push({
    ...structuredClone(mockDb.credentials[0]),
    id: 'lab',
    name: 'fleet-admin',
    clusterName: 'lab-1',
  } as (typeof mockDb.credentials)[number]);
  mockDb.grants.push({
    ...structuredClone(mockDb.grants[0]),
    id: 'lab',
    username: 'admin',
    clusterName: 'lab-1',
    credentialId: 'lab',
  } as (typeof mockDb.grants)[number]);
}

/** Section → item names of the cluster sidebar. */
async function navItems(user: ReturnType<typeof renderApp>['user']): Promise<string[]> {
  await user.click(await screen.findByRole('button', { name: 'Global navigation' }));
  const nav = await screen.findByRole('navigation', { name: 'Global' });
  return within(nav)
    .getAllByRole('link', { hidden: true })
    .map((link) => link.textContent);
}

describe('deployments (QG-3)', () => {
  it(
    'lists the spec columns with status and a pod selector link',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp('/c/dev-1/k8s/ns/shop/deployments');

      const table = await screen.findByRole(
        'grid',
        { name: 'Deployments' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(columnHeaders(table)).toEqual(['Name', 'Status', 'Labels', 'Pod selector', 'Actions']);
      const row = await findRow(table, 'web');
      // OCP `ReplicasCount`: status.replicas of spec.replicas, linking to the deployment's Pods tab.
      expect(within(row).getByRole('link', { name: '3 of 3 pods' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/deployments/web/pods',
      );
      expect(within(cell(row, 'Pod selector')).getByRole('link', { name: 'app=web' })).toHaveAttribute(
        'href',
        PODS_OF_WEB,
      );
      // OCP `LabelList` (SRCH-4): kind-coloured labels, each linking to Search with it and this kind preselected.
      const label = within(cell(row, 'Labels')).getByRole('link', { name: 'app=web' });
      expect(label).toHaveAttribute('href', '/c/dev-1/search/ns/shop?kind=apps~v1~Deployment&q=app%3Dweb');
      expect(label.closest('.pf-v6-c-label')).toHaveClass('pf-m-blue');
    },
  );

  it('opens the selector link on the matching pods only', async () => {
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/deployments');

    const table = await screen.findByRole('grid', { name: 'Deployments' });
    const row = await findRow(table, 'web');
    await user.click(within(cell(row, 'Pod selector')).getByRole('link', { name: 'app=web' }));

    await waitFor(() =>
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(PODS_OF_WEB),
    );
    const pods = await screen.findByRole('grid', { name: 'Pods' });
    for (const pod of WEB_PODS)
      expect(await within(pods).findByRole('link', { name: pod })).toBeInTheDocument();
    expect(within(pods).getAllByRole('row')).toHaveLength(WEB_PODS.length + 1);
  });

  it('shows the OCP details fields, the pod ring and the conditions on the Details tab', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/deployments/web');

    const properties = await screen.findByLabelText('Deployment properties');
    expect(terms(properties)).toEqual([
      'Update strategy',
      'Max unavailable',
      'Max surge',
      'Progress deadline seconds',
      'Min ready seconds',
    ]);
    expect(within(properties).getByText('25% of 3 pods')).toBeInTheDocument();
    expect(within(properties).getByText('25% greater than 3 pods')).toBeInTheDocument();
    const metadata = screen.getByLabelText('Metadata');
    expect(terms(metadata)).toEqual([
      'Name',
      'Namespace',
      'Labels',
      'Pod selector',
      'Node selector',
      'Tolerations',
      'Annotations',
      'Status',
      'Created at',
      'Owner',
    ]);
    // The label links to Search for deployments with it (SRCH-4), the pod selector to the matching pods.
    expect(
      within(metadata)
        .getAllByRole('link', { name: 'app=web' })
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/c/dev-1/search/ns/shop?kind=apps~v1~Deployment&q=app%3Dweb', PODS_OF_WEB]);
    // 2 of 3 replicas available: still rolling out.
    expect(within(metadata).getByText('Updating')).toBeInTheDocument();
    // OCP counts ready + failed pods: 2 ready + 1 crash-looping.
    expect(
      await screen.findByRole('img', { name: '3 Pods 2 Running, 1 CrashLoopBackOff' }),
    ).toBeInTheDocument();
    const conditions = screen.getByRole('grid', { name: 'Conditions' });
    expect(within(conditions).getByText('MinimumReplicasAvailable')).toBeInTheDocument();
  });

  it('lists only its own pods on the Pods tab', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/deployments/web/pods');

    const pods = await screen.findByRole('grid', { name: 'Pods' });
    for (const pod of WEB_PODS)
      expect(await within(pods).findByRole('link', { name: pod })).toBeInTheDocument();
    expect(within(pods).getAllByRole('row')).toHaveLength(WEB_PODS.length + 1);
    expect(screen.getByRole('tab', { name: 'Pods' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('services (QG-3)', () => {
  it("lists OCP's labels, pod selector and location columns", async () => {
    renderApp('/c/dev-1/k8s/ns/shop/services');

    const table = await screen.findByRole('grid', { name: 'Services' });
    expect(columnHeaders(table)).toEqual(['Name', 'Labels', 'Pod selector', 'Location', 'Actions']);
    const row = await findRow(table, 'web');
    expect(within(cell(row, 'Labels')).getByRole('link', { name: 'app=web' })).toHaveAttribute(
      'href',
      '/c/dev-1/search/ns/shop?kind=core~v1~Service&q=app%3Dweb',
    );
    expect(within(cell(row, 'Pod selector')).getByRole('link', { name: 'app=web' })).toHaveAttribute(
      'href',
      PODS_OF_WEB,
    );
    // ClusterIP service: `clusterIP:port` per port.
    expect(within(row).getByText(/^172\.30\.\d+\.17:80$/)).toBeInTheDocument();
  });

  it('links labels to Search in the same scope (all projects)', async () => {
    renderApp('/c/dev-1/k8s/all-namespaces/services');

    const row = await findRow(await screen.findByRole('grid', { name: 'Services' }), 'web');
    expect(within(cell(row, 'Labels')).getByRole('link', { name: 'app=web' })).toHaveAttribute(
      'href',
      '/c/dev-1/search/all-namespaces?kind=core~v1~Service&q=app%3Dweb',
    );
  });

  it('shows the ports table on the Details tab', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/services/web');

    const ports = await screen.findByRole('grid', { name: 'Ports' });
    expect(within(ports).getByText('http')).toBeInTheDocument();
    const summary = screen.getByLabelText('Service properties');
    expect(within(summary).getByText('None')).toBeInTheDocument();
  });
});

describe('projects and namespaces (QG-3)', () => {
  it('lists projects with display name, status and requester', async () => {
    renderApp('/c/dev-1/k8s/cluster/projects');

    const table = await screen.findByRole('grid', { name: 'Projects' });
    expect(columnHeaders(table)).toEqual([
      'Name',
      'Display name',
      'Status',
      'Requester',
      'Created',
      'Actions',
    ]);
    const shop = await findRow(table, 'shop');
    expect(within(shop).getByText('Web shop')).toBeInTheDocument();
    expect(within(shop).getByText('Active')).toBeInTheDocument();
    expect(within(shop).getByText('carol')).toBeInTheDocument();
    expect(await within(table).findByRole('link', { name: 'openshift-monitoring' })).toBeInTheDocument();
  });

  it('shows the project details', async () => {
    renderApp('/c/dev-1/k8s/cluster/projects/shop');

    const details = await screen.findByLabelText('Project properties');
    expect(within(details).getByText('Storefront and its configuration.')).toBeInTheDocument();
    expect(within(details).getByText('carol')).toBeInTheDocument();
  });

  it('lists namespaces and shows details without a requester', async () => {
    const { user } = renderApp('/c/dev-1/k8s/cluster/namespaces');

    const table = await screen.findByRole('grid', { name: 'Namespaces' });
    expect(columnHeaders(table)).toEqual(['Name', 'Display name', 'Status', 'Created', 'Actions']);
    await user.click(within(await findRow(table, 'default')).getByRole('link', { name: 'default' }));

    const details = await screen.findByLabelText('Namespace properties');
    expect(within(details).queryByText('Requester')).not.toBeInTheDocument();
  });

  it('asks for the name before deleting a project or namespace', () => {
    expect(descriptorForPlural('projects')?.deleteRequiresName).toBe(true);
    expect(descriptorForPlural('namespaces')?.deleteRequiresName).toBe(true);
  });
});

describe('navigation (UI-2)', () => {
  it('lists every CP2 kind on OpenShift', async () => {
    const { user } = renderApp('/c/dev-1/k8s/cluster/projects');

    expect(await navItems(user)).toEqual(
      expect.arrayContaining([
        'Projects',
        'Events',
        'Pods',
        'Deployments',
        'ConfigMaps',
        'ReplicaSets',
        'Services',
        'Namespaces',
      ]),
    );
  });

  it('hides Projects where project.openshift.io is not served', async () => {
    grantAdminOnLab1();
    const { user } = renderApp('/c/lab-1/k8s/cluster/namespaces');

    await screen.findByRole('grid', { name: 'Namespaces' });
    const items = await navItems(user);
    expect(items).toContain('Namespaces');
    expect(items).not.toContain('Projects');
  });
});

describe('CP4b kinds (T-0189 foundation)', () => {
  it.each([
    ['statefulsets', 'StatefulSets', 'db'],
    ['daemonsets', 'DaemonSets', 'node-agent'],
    ['replicationcontrollers', 'ReplicationControllers', 'legacy-rc'],
    ['deploymentconfigs', 'DeploymentConfigs', 'frontend'],
    ['jobs', 'Jobs', 'migrate-db'],
    ['cronjobs', 'CronJobs', 'nightly-report'],
    ['horizontalpodautoscalers', 'HorizontalPodAutoscalers', 'worker'],
    ['secrets', 'Secrets', 'db-credentials'],
  ])('lists %s from the fixtures and opens the details page', async (plural, title, name) => {
    const { user, router } = renderApp(`/c/dev-1/k8s/ns/shop/${plural}`);

    const table = await screen.findByRole('grid', { name: title }, { timeout: COLD_START_TIMEOUT_MS });
    const [nameLink] = within(await findRow(table, name)).getAllByRole('link', { name });
    if (!nameLink) throw new Error(`no name link for ${name}`);
    await user.click(nameLink);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/c/dev-1/k8s/ns/shop/${plural}/${name}`),
    );
    expect(await screen.findByRole('tab', { name: 'Details', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(name);
  });

  it.each([
    ['cronjobs/nightly-report/jobs', 'Jobs'],
    ['deploymentconfigs/frontend/replicationcontrollers', 'ReplicationControllers'],
  ])('resolves the kind tab %s', async (path, tab) => {
    const { router } = renderApp(`/c/dev-1/k8s/ns/shop/${path}`);

    expect(await screen.findByRole('tab', { name: tab, selected: true })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/c/dev-1/k8s/ns/shop/${path}`);
  });

  it.each(['jobs', 'replicationcontrollers'])('redirects a pod %s tab to Details', async (tab) => {
    const pod = `/c/dev-1/k8s/ns/shop/pods/${WEB_PODS[0] ?? ''}`;
    const { router } = renderApp(`${pod}/${tab}`);

    await waitFor(() => expect(router.state.location.pathname).toBe(pod));
    expect(await screen.findByRole('tab', { name: 'Details', selected: true })).toBeInTheDocument();
  });
});
