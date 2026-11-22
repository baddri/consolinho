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

/** The table row whose name link is `name`. */
async function findRow(table: HTMLElement, name: string): Promise<HTMLElement> {
  const link = await within(table).findByRole('link', { name });
  const row = link.closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
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
      expect(columnHeaders(table)).toEqual([
        'Name',
        'Status',
        'Labels',
        'Pod selector',
        'Actions',
      ]);
      const row = await findRow(table, 'web');
      expect(within(row).getByText('2 of 3 pods')).toBeInTheDocument();
      expect(within(row).getByRole('link', { name: 'app=web' })).toHaveAttribute('href', PODS_OF_WEB);
    },
  );

  it('opens the selector link on the matching pods only', async () => {
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/deployments');

    const table = await screen.findByRole('grid', { name: 'Deployments' });
    await user.click(within(await findRow(table, 'web')).getByRole('link', { name: 'app=web' }));

    await waitFor(() =>
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(PODS_OF_WEB),
    );
    const pods = await screen.findByRole('grid', { name: 'Pods' });
    for (const pod of WEB_PODS)
      expect(await within(pods).findByRole('link', { name: pod })).toBeInTheDocument();
    expect(within(pods).getAllByRole('row')).toHaveLength(WEB_PODS.length + 1);
  });

  it('shows replicas, strategy and conditions on the Details tab', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/deployments/web');

    const summary = await screen.findByLabelText('Deployment details');
    expect(
      within(summary).getByText('RollingUpdate (max surge 25%, max unavailable 25%)'),
    ).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'app=web' })).toHaveAttribute('href', PODS_OF_WEB);
    const conditions = screen.getByRole('grid', { name: 'Conditions' });
    expect(within(conditions).getByText('MinimumReplicasAvailable')).toBeInTheDocument();
  });
});

describe('services (QG-3)', () => {
  it('lists type, cluster IP, ports and the selector link', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/services');

    const table = await screen.findByRole('grid', { name: 'Services' });
    expect(columnHeaders(table)).toEqual(['Name', 'Type', 'Cluster IP', 'Ports', 'Selector', 'Actions']);
    const row = await findRow(table, 'web');
    expect(within(row).getByText('ClusterIP')).toBeInTheDocument();
    expect(within(row).getByText('80/TCP → 8080')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'app=web' })).toHaveAttribute('href', PODS_OF_WEB);
  });

  it('shows the ports table on the Details tab', async () => {
    renderApp('/c/dev-1/k8s/ns/shop/services/web');

    const ports = await screen.findByRole('grid', { name: 'Ports' });
    expect(within(ports).getByText('http')).toBeInTheDocument();
    const summary = screen.getByLabelText('Service details');
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

    const details = await screen.findByLabelText('Project details');
    expect(within(details).getByText('Storefront and its configuration.')).toBeInTheDocument();
    expect(within(details).getByText('carol')).toBeInTheDocument();
  });

  it('lists namespaces and shows details without a requester', async () => {
    const { user } = renderApp('/c/dev-1/k8s/cluster/namespaces');

    const table = await screen.findByRole('grid', { name: 'Namespaces' });
    expect(columnHeaders(table)).toEqual(['Name', 'Display name', 'Status', 'Created', 'Actions']);
    await user.click(within(await findRow(table, 'default')).getByRole('link', { name: 'default' }));

    const details = await screen.findByLabelText('Namespace details');
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
