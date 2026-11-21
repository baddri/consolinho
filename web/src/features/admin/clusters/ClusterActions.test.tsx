import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import { CSRF_HEADER } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { http, mockDb, problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';

/** Waits for the clusters table with data rows. */
async function findClustersTable(timeout?: number) {
  const table = await screen.findByRole('grid', { name: 'Clusters' }, { timeout });
  await within(table).findByRole('link', { name: 'prod-eu-1' });
  return table;
}

/** The table row of cluster `name`. */
function rowOf(table: HTMLElement, name: string): HTMLElement {
  const row = within(table).getByRole('link', { name }).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

/** Opens the row kebab of `name`. */
async function openKebab(user: UserEvent, table: HTMLElement, name: string): Promise<HTMLElement[]> {
  await user.click(within(rowOf(table, name)).getByRole('button', { name: 'Kebab toggle' }));
  return screen.findAllByRole('menuitem');
}

/** Records the method, path and CSRF header of every non-GET request. */
function recordCommands() {
  const commands: { method: string; path: string; csrf: string | null }[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'GET') {
      commands.push({
        method: request.method,
        path: new URL(request.url).pathname,
        csrf: request.headers.get(CSRF_HEADER),
      });
    }
  });
  return commands;
}

beforeEach(() => mockViewportWidth(1440));
afterEach(() => server.events.removeAllListeners());

describe('Cluster actions (CLU-5, CLU-6)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'CLU-5: disables a production cluster naming environment and user count, and refreshes the switcher',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const commands = recordCommands();
      const { user, queryClient } = renderApp('/admin/clusters');
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const table = await findClustersTable(COLD_START_TIMEOUT_MS);

      const items = await openKebab(user, table, 'prod-eu-1');
      expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Test connection', 'Disable', 'Delete']);
      await user.click(screen.getByRole('menuitem', { name: 'Disable' }));

      const dialog = await screen.findByRole('dialog', { name: /Disable prod-eu-1/ });
      expect(within(dialog).getByText('prod')).toBeInTheDocument();
      expect(dialog).toHaveTextContent(
        'Disable prod-eu-1 (production)? 3 users will no longer see it in the cluster switcher.',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Disable' }));

      expect(await screen.findByText('Cluster prod-eu-1 disabled')).toBeInTheDocument();
      await waitFor(() =>
        expect(within(rowOf(table, 'prod-eu-1')).getByText('Disabled')).toBeInTheDocument(),
      );
      expect(commands).toEqual([
        { method: 'POST', path: '/api/admin/clusters/prod-eu-1/disable', csrf: '1' },
      ]);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: accessibleClustersQueryKey });
    },
  );

  it('CLU-5: enables a disabled cluster and refreshes the switcher', async () => {
    const commands = recordCommands();
    const { user, queryClient } = renderApp('/admin/clusters');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const table = await findClustersTable();

    await openKebab(user, table, 'dev-2');
    await user.click(screen.getByRole('menuitem', { name: 'Enable' }));
    const dialog = await screen.findByRole('dialog', { name: /Enable dev-2/ });
    expect(dialog).toHaveTextContent('1 user will see it in the cluster switcher again.');
    await user.click(within(dialog).getByRole('button', { name: 'Enable' }));

    expect(await screen.findByText('Cluster dev-2 enabled')).toBeInTheDocument();
    await waitFor(() => expect(within(rowOf(table, 'dev-2')).getByText('Enabled')).toBeInTheDocument());
    expect(commands).toEqual([{ method: 'POST', path: '/api/admin/clusters/dev-2/enable', csrf: '1' }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: accessibleClustersQueryKey });
  });

  it('CLU-6: Delete is aria-disabled with the reason while the cluster is enabled', async () => {
    const commands = recordCommands();
    const { user } = renderApp('/admin/clusters');
    const table = await findClustersTable();

    await openKebab(user, table, 'prod-eu-1');
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    expect(del).toHaveAttribute('aria-disabled', 'true');
    await user.hover(del);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Disable the cluster before deleting it.');
    await user.click(del);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(commands).toEqual([]);
  });

  it('CLU-6: deletes dev-2 after typing its name, with counts and the CSRF header', async () => {
    const commands = recordCommands();
    const { user, queryClient } = renderApp('/admin/clusters');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const table = await findClustersTable();

    await openKebab(user, table, 'dev-2');
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: /^Delete cluster\?/ });
    // OCP delete wording: warning icon in the title, the name in bold in the body.
    expect(within(dialog).getByRole('heading', { name: /^Warning alert: ?Delete cluster\?/ })).toBeInTheDocument();
    expect(within(dialog).getByText('dev-2', { selector: 'strong' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'Are you sure you want to delete dev-2? 1 credential and 1 grant will be removed. This cannot be undone.',
    );
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole('textbox'));
    await user.paste('dev-2');
    await user.click(confirm);

    expect(await screen.findByText('Cluster dev-2 deleted')).toBeInTheDocument();
    await waitFor(() => expect(within(table).queryByRole('link', { name: 'dev-2' })).not.toBeInTheDocument());
    expect(commands).toEqual([{ method: 'DELETE', path: '/api/admin/clusters/dev-2', csrf: '1' }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: accessibleClustersQueryKey });
    expect(mockDb.clusters.some((c) => c.name === 'dev-2')).toBe(false);
  });

  it('CLU-6: shows a 409 Clusters.NotDisabled in the dialog', async () => {
    server.use(
      http.delete('/api/admin/clusters/{name}', () =>
        problem(409, { code: 'Clusters.NotDisabled', detail: 'Disable dev-2 before deleting it.' }),
      ),
    );
    const { user } = renderApp('/admin/clusters');
    const table = await findClustersTable();

    await openKebab(user, table, 'dev-2');
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: /^Delete cluster\?/ });
    await user.click(within(dialog).getByRole('textbox'));
    await user.paste('dev-2');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await within(dialog).findByText('Disable dev-2 before deleting it.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /^Delete cluster\?/ })).toBeInTheDocument();
  });

  it('T-0033 review: an action on a cluster deleted meanwhile closes the dialog with a toast', async () => {
    const { user } = renderApp('/admin/clusters');
    const table = await findClustersTable();

    await openKebab(user, table, 'dev-1');
    await user.click(screen.getByRole('menuitem', { name: 'Disable' }));
    const dialog = await screen.findByRole('dialog', { name: /Disable dev-1/ });
    mockDb.clusters.splice(
      mockDb.clusters.findIndex((c) => c.name === 'dev-1'),
      1,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Disable' }));

    expect(await screen.findByText('Cluster dev-1 no longer exists')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(within(table).queryByRole('link', { name: 'dev-1' })).not.toBeInTheDocument());
  });

  it('Edit navigates to the edit form', async () => {
    const { user, router } = renderApp('/admin/clusters');
    const table = await findClustersTable();

    await openKebab(user, table, 'dev-1');
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/clusters/dev-1/edit'));
  });

  it('ADM-2: every row action is aria-disabled for a read-only admin', async () => {
    setMockUser('ines');
    const commands = recordCommands();
    const { user } = renderApp('/admin/clusters');
    const table = await findClustersTable();

    const items = await openKebab(user, table, 'dev-2');
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Test connection', 'Enable', 'Delete']);
    for (const item of items) expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('menuitem', { name: 'Enable' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(commands).toEqual([]);
  });
});
