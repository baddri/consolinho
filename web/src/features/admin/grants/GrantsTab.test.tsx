import { screen, waitFor, within } from '@testing-library/react';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import { CSRF_HEADER, type AccessibleCluster, type Grant } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import {
  clearClusterAccess,
  credentialIds,
  grantIds,
  http,
  mockDb,
  problem,
  setMockUser,
  validationProblem,
} from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminKeys } from '../queryKeys';
import { withoutBadges } from '../dataViewTestUtils';
import { adminRoute } from '../routes';

type User = ReturnType<typeof renderApp>['user'];

/** Waits for the loaded grants table named `name`. */
async function findTable(name: string, timeout?: number) {
  const table = await screen.findByRole('grid', { name }, { timeout });
  await within(table).findAllByRole('button', { name: 'Kebab toggle' }, { timeout });
  return table;
}

/** The body row whose first cell starts with `text` (after the kind badge). */
function rowOf(table: HTMLElement, text: string): HTMLElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => withoutBadges(within(candidate).queryAllByRole('cell')[0]).startsWith(text));
  if (!row) throw new Error(`No row ${text}`);
  return row;
}

/** First-column texts of the body rows. */
function firstCells(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => withoutBadges(within(row).queryAllByRole('cell')[0]));
}

/** Text of the cell with `dataLabel` in `row`. */
function cellText(row: HTMLElement, label: string): string {
  return withoutBadges(row.querySelector(`[data-label="${label}"]`) ?? undefined);
}

/** Opens the row kebab of `text` and clicks `action`. */
async function rowAction(user: User, table: HTMLElement, text: string, action: string) {
  await user.click(within(rowOf(table, text)).getByRole('button', { name: 'Kebab toggle' }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

/** Types `text` into the typeahead `label` and picks the option starting with `value`. */
async function pick(user: User, label: string, text: string, value: string) {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.paste(text);
  await user.click(await screen.findByRole('option', { name: new RegExp(`^${value}`) }));
}

/** Clicks the first button named `name` (the empty state repeats the toolbar's create button). */
async function clickFirst(user: User, name: string) {
  const [button] = await screen.findAllByRole('button', { name });
  if (!button) throw new Error(`No button ${name}`);
  await user.click(button);
}

/** Opens the credential select and picks `name`. */
async function pickCredential(user: User, name: string) {
  await user.click(screen.getByRole('button', { name: 'Credential' }));
  await user.click(await screen.findByRole('option', { name: new RegExp(`^${name}`) }));
}

/** Records the JSON body and CSRF header of grant writes, then lets the mock backend answer. */
function captureGrantWrites() {
  const writes: { method: string; body: unknown; csrf: string | null }[] = [];
  const record = async (request: Request) => {
    const body: unknown = request.method === 'DELETE' ? null : await request.clone().json();
    writes.push({ method: request.method, body, csrf: request.headers.get(CSRF_HEADER) });
    return undefined;
  };
  server.use(
    http.post('/api/admin/grants', ({ request }) => record(request)),
    http.put('/api/admin/grants/{grantId}', ({ request }) => record(request)),
    http.delete('/api/admin/grants/{grantId}', ({ request }) => record(request)),
  );
  return writes;
}

beforeEach(() => mockViewportWidth(1440));

describe('Grants tabs (T-0039)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'USR-7: the user tab lists the clusters with access mode, credential and granted',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp('/fleet/admin/users/alice/access');
      const table = await findTable('Cluster access of alice', COLD_START_TIMEOUT_MS);
      expect(
        within(table)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['prod-eu-1', 'staging-eu-1', 'lab-1']);
      const prod = rowOf(table, 'prod-eu-1');
      expect(within(prod).getByRole('link', { name: 'prod-eu-1' })).toHaveAttribute(
        'href',
        '/fleet/admin/clusters/prod-eu-1',
      );
      expect(cellText(prod, 'Access mode')).toBe('Read only');
      expect(cellText(prod, 'Credential')).toMatch(/^fleet-viewValid.*Passed · Cluster-wide view/);
      expect(cellText(prod, 'Granted')).toMatch(/ago by admin$/);
      expect(cellText(rowOf(table, 'staging-eu-1'), 'Access mode')).toBe('Read write');
    },
  );

  it('GRANT-5: marks disabled clusters, expired credentials and deactivated users', async () => {
    const { router } = renderApp('/fleet/admin/users/carol/access');
    let table = await findTable('Cluster access of carol');
    expect(rowOf(table, 'dev-2')).toHaveTextContent('Cluster disabled');
    expect(rowOf(table, 'prod-eu-1')).not.toHaveTextContent('Cluster disabled');

    await router.navigate('/fleet/admin/users/ines/access');
    table = await findTable('Cluster access of ines');
    expect(rowOf(table, 'prod-us-1')).toHaveTextContent('Credential expired');

    await router.navigate('/fleet/admin/clusters/dev-1/access');
    table = await findTable('Access to dev-1');
    expect(rowOf(table, 'dave')).toHaveTextContent('User deactivated');
    expect(rowOf(table, 'admin')).not.toHaveTextContent('User deactivated');
  });

  it('CLU-8: the cluster Access tab lists users and filters by text (q in the URL)', async () => {
    const { user, router } = renderApp('/fleet/admin/clusters/prod-eu-1/access');
    const table = await findTable('Access to prod-eu-1');
    expect(firstCells(table).map((text) => text.split(/[A-Z]/)[0])).toEqual([
      'alice',
      'carol',
      'pending-paul',
    ]);
    expect(cellText(rowOf(table, 'carol'), 'Access mode')).toBe('Read write');

    await user.click(screen.getByRole('textbox', { name: 'Search grants' }));
    await user.paste('car');
    await waitFor(() => expect(firstCells(table)).toHaveLength(1));
    expect(router.state.location.search).toBe('?q=car');

    await user.clear(screen.getByRole('textbox', { name: 'Search grants' }));
    await user.paste('nobody');
    expect(await within(table).findByText('No grants match')).toBeInTheDocument();
  });

  it('GRANT-2: a cluster with one credential pre-selects it; ReadOnly is the default', async () => {
    const writes = captureGrantWrites();
    const { user } = renderApp('/fleet/admin/clusters/staging-eu-1/access');
    await clickFirst(user, 'Grant access');
    const dialog = await screen.findByRole('dialog', { name: /Grant access to staging-eu-1/ });

    await pick(user, 'User', 'bob', 'bob');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Credential' })).toHaveTextContent('fleet-admin'),
    );
    expect(within(dialog).getByRole('radio', { name: /Read only/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByText('Granted bob ReadOnly on staging-eu-1')).toBeInTheDocument();
    expect(writes).toEqual([
      {
        method: 'POST',
        body: {
          username: 'bob',
          clusterName: 'staging-eu-1',
          credentialId: credentialIds.stagingAdmin,
          accessMode: 'readOnly',
        },
        csrf: '1',
      },
    ]);
  });

  it('GRANT-2/Q7: picker test labels and the production read-write warning', async () => {
    const { user } = renderApp('/fleet/admin/clusters/prod-us-1/access');
    await clickFirst(user, 'Grant access');
    const dialog = await screen.findByRole('dialog', { name: /Grant access to prod-us-1/ });

    await pick(user, 'User', 'bob', 'bob');
    expect(within(dialog).getByRole('button', { name: 'Credential' })).toHaveTextContent(
      'Select a credential',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Credential' }));
    expect(await screen.findByRole('option', { name: /^fleet-view/ })).toHaveTextContent(
      /Expired.*Last test failed/,
    );
    expect(screen.getByRole('option', { name: /^legacy-token/ })).toHaveTextContent('Never tested');
    await user.click(screen.getByRole('option', { name: /^legacy-token/ }));

    const warning = 'This user will be able to change production cluster prod-us-1.';
    expect(within(dialog).queryByText(warning)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: /Read write/ }));
    expect(within(dialog).getByText(warning)).toBeInTheDocument();
  });

  it('GRANT-2: creates from the cluster page by picking a user and a credential', async () => {
    const writes = captureGrantWrites();
    const { user } = renderApp('/fleet/admin/clusters/prod-eu-1/access');
    await findTable('Access to prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Grant access' }));
    const dialog = await screen.findByRole('dialog', { name: /Grant access to prod-eu-1/ });

    await user.click(within(dialog).getByRole('combobox', { name: 'User' }));
    expect(await screen.findByRole('option', { name: /^alice/ })).toBeDisabled();
    await user.paste('bob');
    await user.click(await screen.findByRole('option', { name: /^bob/ }));
    await pickCredential(user, 'fleet-edit');
    await user.click(within(dialog).getByRole('radio', { name: /Read write/ }));
    expect(
      within(dialog).getByText('This user will be able to change production cluster prod-eu-1.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByText('Granted bob ReadWrite on prod-eu-1')).toBeInTheDocument();
    expect(writes[0]?.body).toEqual({
      username: 'bob',
      clusterName: 'prod-eu-1',
      credentialId: credentialIds.prodEuEdit,
      accessMode: 'readWrite',
    });
    expect(writes[0]?.csrf).toBe('1');
  });

  it('GRANT-1: a duplicate shows inline on the picker, a foreign credential on the credential field', async () => {
    let answer = problem(409, {
      code: 'Grants.AlreadyExists',
      detail: 'bob already has access to dev-1 — change the existing grant instead',
    });
    server.use(http.post('/api/admin/grants', () => answer));
    const { user } = renderApp('/fleet/admin/clusters/dev-1/access');
    await clickFirst(user, 'Grant access');
    const dialog = await screen.findByRole('dialog', { name: /Grant access to dev-1/ });
    await pick(user, 'User', 'bob', 'bob');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Credential' })).toHaveTextContent('fleet-edit'),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    const picker = within(dialog).getByRole('combobox', { name: 'User' });
    await waitFor(() => expect(picker).toHaveAttribute('aria-invalid', 'true'));
    expect(picker).toHaveAccessibleDescription(
      expect.stringContaining('bob already has access to dev-1 — change the existing grant instead'),
    );

    answer = validationProblem({ credentialId: ['This credential belongs to another cluster.'] });
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    const credential = within(dialog).getByRole('button', { name: 'Credential' });
    await waitFor(() =>
      expect(credential).toHaveAccessibleDescription(
        expect.stringContaining('This credential belongs to another cluster.'),
      ),
    );
    expect(screen.getByRole('dialog', { name: /Grant access to dev-1/ })).toBeInTheDocument();
  });

  it('GRANT-3: changes mode and credential with the version, recovering from a conflict', async () => {
    const writes = captureGrantWrites();
    const { user, queryClient } = renderApp('/fleet/admin/users/alice/access');
    const table = await findTable('Cluster access of alice');
    await rowAction(user, table, 'prod-eu-1', 'Change');
    const dialog = await screen.findByRole('dialog', { name: /Change alice's access to prod-eu-1/ });
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();

    // Another admin changes the grant meanwhile: our version is stale.
    const stored = mockDb.grants.find((grant) => grant.id === grantIds.aliceProdEu);
    if (stored) stored.version = 7;
    await pickCredential(user, 'fleet-edit');
    await user.click(within(dialog).getByRole('radio', { name: /Read write/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await within(dialog).findByRole('button', { name: 'Reload latest values' });
    // The 409 refetches the list in the background; the open form must keep its version (ADM-4: no lost update).
    await waitFor(() =>
      expect(queryClient.getQueryData<Grant[]>(adminKeys.userGrants('alice'))?.[0]?.version).toBe(7),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(await within(dialog).findByRole('button', { name: 'Reload latest values' })).toBeInTheDocument();
    expect(screen.queryByText("Changed alice's access to prod-eu-1")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Reload latest values' }));
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: 'Reload latest values' })).not.toBeInTheDocument(),
    );

    await pickCredential(user, 'fleet-edit');
    await user.click(within(dialog).getByRole('radio', { name: /Read write/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText("Changed alice's access to prod-eu-1")).toBeInTheDocument();
    expect(writes.map((write) => write.body)).toEqual([
      { accessMode: 'readWrite', credentialId: credentialIds.prodEuEdit, version: 1 },
      { accessMode: 'readWrite', credentialId: credentialIds.prodEuEdit, version: 1 },
      { accessMode: 'readWrite', credentialId: credentialIds.prodEuEdit, version: 7 },
    ]);
    await waitFor(() => expect(cellText(rowOf(table, 'prod-eu-1'), 'Access mode')).toBe('Read write'));
  });

  it('GRANT-3: revoke names user, cluster and environment; 204 removes the row', async () => {
    const writes = captureGrantWrites();
    const { user } = renderApp('/fleet/admin/clusters/prod-eu-1/access');
    const table = await findTable('Access to prod-eu-1');
    await rowAction(user, table, 'carol', 'Revoke');
    const dialog = await screen.findByRole('dialog', { name: 'Revoke access? prod' });
    expect(dialog).toHaveTextContent("Are you sure you want to revoke carol's access to prod-eu-1?");
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByText("Revoked carol's access to prod-eu-1")).toBeInTheDocument();
    await waitFor(() => expect(firstCells(table).some((text) => text.startsWith('carol'))).toBe(false));
    expect(writes).toEqual([{ method: 'DELETE', body: null, csrf: '1' }]);
  });

  it('GRANT-3: revoking a grant revoked meanwhile closes with a warning toast', async () => {
    const { user } = renderApp('/fleet/admin/clusters/prod-eu-1/access');
    const table = await findTable('Access to prod-eu-1');
    await rowAction(user, table, 'carol', 'Revoke');
    const dialog = await screen.findByRole('dialog', { name: /^Revoke access\?/ });
    mockDb.grants = mockDb.grants.filter((grant) => grant.id !== grantIds.carolProdEu);
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByText("carol's access to prod-eu-1 was already revoked")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(firstCells(table).some((text) => text.startsWith('carol'))).toBe(false));
  });

  it('GRANT-2: the picker says when its options could not load', async () => {
    server.use(http.get('/api/admin/users', () => problem(500, { detail: 'Database unavailable' })));
    const { user } = renderApp('/fleet/admin/clusters/prod-eu-1/access');
    await clickFirst(user, 'Grant access');
    await screen.findByRole('dialog', { name: /Grant access to prod-eu-1/ });
    await user.click(screen.getByRole('combobox', { name: 'User' }));
    expect(await screen.findByRole('option', { name: 'Could not load users' })).toBeDisabled();
  });

  it('GRANT-6: an admin granting themselves a cluster sees it in the switcher without reload', async () => {
    setMockUser('admin');
    const { user, queryClient } = renderApp('/fleet/admin/clusters/staging-eu-1/access');
    await waitFor(() => expect(queryClient.getQueryData(accessibleClustersQueryKey)).toBeDefined());
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await clickFirst(user, 'Grant access');
    const dialog = await screen.findByRole('dialog', { name: /Grant access to staging-eu-1/ });
    await pick(user, 'User', 'admin', 'admin');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Credential' })).toHaveTextContent('fleet-admin'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: accessibleClustersQueryKey });
    await waitFor(() =>
      expect(
        queryClient
          .getQueryData<AccessibleCluster[]>(accessibleClustersQueryKey)
          ?.map((cluster) => cluster.name),
      ).toContain('staging-eu-1'),
    );
  });

  it('QG-3: empty and error states per tab', async () => {
    clearClusterAccess('lab-1');
    const { user, router } = renderApp('/fleet/admin/clusters/lab-1/access');
    expect(await screen.findByText('Nobody has access to this cluster')).toBeInTheDocument();

    let fail = true;
    server.use(
      http.get('/api/admin/users/{username}/grants', () =>
        fail ? problem(500, { detail: 'Database unavailable' }) : undefined,
      ),
    );
    await router.navigate('/fleet/admin/users/alice/access');
    expect(await screen.findByText('Could not load grants')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await findTable('Cluster access of alice');
  });

  it('ADM-2: a read-only admin sees create and row actions disabled', async () => {
    setMockUser('ines');
    const { user } = renderApp('/fleet/admin/users/alice/access');
    const table = await findTable('Cluster access of alice');
    expect(screen.getByRole('button', { name: 'Grant access' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(within(rowOf(table, 'prod-eu-1')).getByRole('button', { name: 'Kebab toggle' }));
    expect(await screen.findByRole('menuitem', { name: 'Change' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Revoke' })).toHaveAttribute('aria-disabled', 'true');
  });
});
