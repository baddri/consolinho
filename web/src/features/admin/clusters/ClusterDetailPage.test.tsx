import { screen, waitFor, within } from '@testing-library/react';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import type { CaCertificate, ClusterDetail } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { http, mockDb, problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminKeys } from '../queryKeys';
import { adminRoute } from '../routes';

/** Waits for the loaded Details tab. */
async function findDetails(timeout?: number) {
  return screen.findByLabelText('Cluster details', { selector: 'dl' }, { timeout });
}

/** Reads both details columns of the Details tab as `term → text`. */
function details(): Record<string, string> {
  const panel = screen.getByRole('tabpanel', { name: 'Details' });
  const terms = within(panel).getAllByRole('term');
  const values = within(panel).getAllByRole('definition');
  return Object.fromEntries(terms.map((term, i) => [term.textContent, values[i]?.textContent ?? '']));
}

/** Opens the Actions menu and returns its items. */
async function openActions(user: ReturnType<typeof renderApp>['user']) {
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  return screen.findAllByRole('menuitem');
}

/** Removes a cluster from the mock backend, as if another admin deleted it. */
function deleteBehindOurBack(name: string) {
  const index = mockDb.clusters.findIndex((cluster) => cluster.name === name);
  if (index >= 0) mockDb.clusters.splice(index, 1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A certificate fixture expiring `days` from now. */
function certificate(cn: string, days: number, expiryStatus: CaCertificate['expiryStatus']): CaCertificate {
  return {
    subject: `CN=${cn}`,
    issuer: 'CN=root-ca',
    notBefore: new Date(Date.now() - 365 * DAY_MS).toISOString(),
    notAfter: new Date(Date.now() + days * DAY_MS).toISOString(),
    expiryStatus,
    sha256Fingerprint: Array.from({ length: 32 }, (_, i) => (i + cn.length).toString(16).padStart(2, '0'))
      .join(':')
      .toUpperCase(),
  };
}

/** A cluster with one certificate per expiry state (CLU-2). */
const CERT_CLUSTER: ClusterDetail = {
  name: 'certs-1',
  displayName: 'certs-1',
  environment: 'staging',
  apiUrl: 'https://api.certs-1.example.com:6443',
  webConsoleUrl: null,
  description: null,
  caBundle: '-----BEGIN CERTIFICATE-----fake-----END CERTIFICATE-----',
  caCertificates: [
    certificate('ok-ca', 400, 'ok'),
    certificate('soon-ca', 10, 'expiringSoon'),
    certificate('old-ca', -5, 'expired'),
  ],
  skipTlsVerify: false,
  tlsMode: 'caBundle',
  isEnabled: true,
  credentialCount: 0,
  grantCount: 0,
  connectionSettingsChangedAt: new Date(Date.now() - DAY_MS).toISOString(),
  createdAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
  createdBy: 'admin',
  updatedAt: null,
  updatedBy: null,
  version: 1,
};

beforeEach(() => mockViewportWidth(1440));

describe('ClusterDetailPage (T-0035)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'CLU-8: header, details, external console link and audit link for prod-eu-1',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp('/admin/clusters/prod-eu-1');
      const list = await findDetails(COLD_START_TIMEOUT_MS);

      expect(screen.getByRole('heading', { name: 'prod-eu-1', level: 1 })).toBeInTheDocument();
      // OCP details heading: large kind badge, name and status; no subtitle (the display name is a details item).
      expect(screen.queryByText('Production EU 1', { selector: 'p' })).not.toBeInTheDocument();
      const labels = screen.getByRole('list', { name: 'Cluster labels' });
      expect(within(labels).getByText('prod')).toBeInTheDocument();
      expect(within(labels).queryByText('TLS not verified')).not.toBeInTheDocument();
      // Header status label + details Status.
      expect(screen.getAllByText('Enabled')).toHaveLength(2);
      const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(within(crumbs).getByRole('link', { name: 'Clusters' })).toHaveAttribute('href', '/admin/clusters');
      expect(within(crumbs).getByText('Cluster details')).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('heading', { name: 'Cluster details', level: 2 })).toBeInTheDocument();

      expect(within(list).getAllByRole('term').map((term) => term.textContent)).toEqual([
        'Name',
        'Display name',
        'Environment',
        'Description',
        'Status',
        'Web console',
      ]);
      const values = details();
      expect(values).toMatchObject({
        'Display name': 'Production EU 1',
        Environment: 'prod',
        Description: 'Customer-facing workloads, Frankfurt.',
        TLS: 'CA bundle',
        Status: 'Enabled',
        'Users with access': '3',
      });
      expect(values['API URL']).toContain(mockDb.clusters.find((c) => c.name === 'prod-eu-1')?.apiUrl);
      expect(screen.getByRole('button', { name: 'Copy API URL' })).toBeInTheDocument();
      expect(values.Created).toMatch(/ago by /);
      const consoleLink = within(list).getByRole('link', {
        name: 'https://console-openshift-console.apps.prod-eu-1.example.com',
      });
      expect(consoleLink).toHaveAttribute('target', '_blank');
      expect(consoleLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByRole('link', { name: 'View audit entries' })).toHaveAttribute(
        'href',
        '/admin/audit?cluster=prod-eu-1',
      );
      expect(screen.getByRole('grid', { name: 'CA certificates of prod-eu-1' })).toBeInTheDocument();
    },
  );

  it('CLU-2: certificates show their expiry labels', async () => {
    server.use(http.get('/api/admin/clusters/{name}', ({ response }) => response(200).json(CERT_CLUSTER)));
    renderApp('/admin/clusters/certs-1');
    await findDetails();

    const table = screen.getByRole('grid', { name: 'CA certificates of certs-1' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[3]?.textContent)).toEqual([
      'Valid',
      'Expires soon',
      'Expired',
    ]);
    expect(within(rows[1] ?? table).getByText(/^in \d+ days$/)).toBeInTheDocument();
    expect(within(rows[2] ?? table).getByText(/ago$/)).toBeInTheDocument();
    expect(screen.queryByText('No CA bundle — the system trust store is used.')).not.toBeInTheDocument();
  });

  it('CLU-2: no bundle uses the system trust store', async () => {
    renderApp('/admin/clusters/lab-1');
    await findDetails();

    expect(screen.getByText('No CA bundle — the system trust store is used.')).toBeInTheDocument();
    expect(screen.queryByRole('grid', { name: /CA certificates/ })).not.toBeInTheDocument();
    expect(details()['Web console']).toBe('—');
  });

  it('CLU-3: skip-TLS shows the header label and a warning instead of the trust-store note', async () => {
    renderApp('/admin/clusters/staging-eu-1');
    await findDetails();

    const labels = screen.getByRole('list', { name: 'Cluster labels' });
    expect(within(labels).getByText('TLS not verified')).toBeInTheDocument();
    expect(screen.getByText('TLS verification is disabled for this cluster.')).toBeInTheDocument();
    expect(screen.queryByText('No CA bundle — the system trust store is used.')).not.toBeInTheDocument();
  });

  it('tabs are URL-driven', async () => {
    const { user, router } = renderApp('/admin/clusters/dev-1/credentials');

    expect(await screen.findByRole('tab', { name: 'Credentials' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Credentials' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Cluster details')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Access' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/clusters/dev-1/access'));
    expect(await screen.findByRole('tabpanel', { name: 'Access' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/clusters/dev-1'));
    expect(await findDetails()).toBeInTheDocument();
  });

  it('CLU-8: Actions for an enabled cluster — Delete is aria-disabled with the reason', async () => {
    const { user } = renderApp('/admin/clusters/dev-1');
    await findDetails();

    const items = await openActions(user);
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Test connection', 'Disable', 'Delete']);
    const remove = screen.getByRole('menuitem', { name: 'Delete' });
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    await user.hover(remove);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Disable the cluster before deleting it.');
    expect(screen.getByRole('menuitem', { name: 'Disable' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('CLU-5: enabling dev-2 updates the header from the response and refreshes the switcher', async () => {
    const { user, queryClient } = renderApp('/admin/clusters/dev-2');
    await findDetails();
    // Header status label + details Status.
    expect(screen.getAllByText('Disabled')).toHaveLength(2);
    const setData = vi.spyOn(queryClient, 'setQueryData');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const items = await openActions(user);
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Test connection', 'Enable', 'Delete']);
    expect(screen.getByRole('menuitem', { name: 'Delete' })).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Enable' }));
    const dialog = await screen.findByRole('dialog', { name: /^Enable cluster\?/ });
    await user.click(within(dialog).getByRole('button', { name: 'Enable' }));

    await waitFor(() => expect(screen.queryByText('Disabled')).not.toBeInTheDocument());
    expect(screen.getAllByText('Enabled')).toHaveLength(2);
    expect(setData).toHaveBeenCalledWith(adminKeys.cluster('dev-2'), expect.objectContaining({ isEnabled: true }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: accessibleClustersQueryKey });
  });

  it('CLU-6: deleting dev-2 returns to the list', async () => {
    const { user, router } = renderApp('/admin/clusters/dev-2');
    await findDetails();

    await openActions(user);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: /^Delete cluster\?/ });
    await user.click(within(dialog).getByRole('textbox'));
    await user.paste('dev-2');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Cluster dev-2 deleted')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/clusters'));
    expect(screen.queryByText('Cluster dev-2 no longer exists')).not.toBeInTheDocument();
  });

  it('ADM-2: every action is aria-disabled for a read-only admin', async () => {
    setMockUser('ines');
    const { user } = renderApp('/admin/clusters/dev-2');
    await findDetails();

    const items = await openActions(user);
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Test connection', 'Enable', 'Delete']);
    for (const item of items) expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('T-0033 review: an action on a cluster deleted meanwhile toasts once and returns to the list', async () => {
    const { user, router } = renderApp('/admin/clusters/dev-1');
    await findDetails();

    await openActions(user);
    await user.click(screen.getByRole('menuitem', { name: 'Disable' }));
    const dialog = await screen.findByRole('dialog', { name: /^Disable cluster\?/ });
    deleteBehindOurBack('dev-1');
    await user.click(within(dialog).getByRole('button', { name: 'Disable' }));

    expect(await screen.findByText('Cluster dev-1 no longer exists')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/clusters'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Cluster dev-1 no longer exists')).toHaveLength(1);
  });

  it('T-0033 review: a refetch that finds the cluster deleted returns to the list', async () => {
    const { router, queryClient } = renderApp('/admin/clusters/dev-1');
    await findDetails();

    deleteBehindOurBack('dev-1');
    await queryClient.invalidateQueries({ queryKey: adminKeys.cluster('dev-1') });

    expect(await screen.findByText('Cluster dev-1 no longer exists')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/clusters'));
  });

  it('QG-3: an unknown cluster shows a not-found state with a way back', async () => {
    const { user, router } = renderApp('/admin/clusters/nope');

    expect(await screen.findByRole('heading', { name: 'Cluster nope not found' })).toBeInTheDocument();
    expect(screen.queryByText(/Loading cluster/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to Clusters' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/clusters'));
  });

  it('QG-3: other errors show the detail with a working Retry', async () => {
    server.use(http.get('/api/admin/clusters/{name}', () => problem(500, { detail: 'Database unavailable.' })));
    const { user } = renderApp('/admin/clusters/dev-1');

    expect(await screen.findByText('Could not load cluster')).toBeInTheDocument();
    expect(screen.getByText('Database unavailable.')).toBeInTheDocument();
    expect(screen.queryByText(/Loading cluster/)).not.toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await findDetails()).toBeInTheDocument();
  });
});
