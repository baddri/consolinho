import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { CSRF_HEADER } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { http, mockDb, problem, setMockUser, validationProblem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';

/** Waits for the users table with data rows. */
async function findUsersTable(timeout?: number) {
  const table = await screen.findByRole('grid', { name: 'Users' }, { timeout });
  await within(table).findByRole('link', { name: 'admin' });
  return table;
}

/** The table row of `username`. */
function rowOf(table: HTMLElement, username: string): HTMLElement {
  const row = within(table).getByRole('link', { name: username }).closest('tr');
  if (!row) throw new Error(`no row for ${username}`);
  return row;
}

/** Opens the row kebab of `username` and returns the titles of its menu items. */
async function openKebab(user: UserEvent, table: HTMLElement, username: string): Promise<string[]> {
  await user.click(within(rowOf(table, username)).getByRole('button', { name: 'Kebab toggle' }));
  const items = await screen.findAllByRole('menuitem');
  return items.map((item) => item.textContent);
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

/** Bumps a fixture user's version behind the UI's back (another admin's edit). */
function bumpVersion(username: string) {
  const fixture = mockDb.users.find((u) => u.username === username);
  if (!fixture) throw new Error(`no fixture ${username}`);
  fixture.version += 1;
}

beforeEach(() => mockViewportWidth(1440));
afterEach(() => server.events.removeAllListeners());

describe('User actions (T-0031)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'USR-2: creates a user with the CSRF header, toasts and opens the detail page',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const commands = recordCommands();
      const { user, router } = renderApp('/fleet/admin/users');
      await findUsersTable(COLD_START_TIMEOUT_MS);

      await user.click(screen.getByRole('button', { name: 'Add user' }));
      const dialog = await screen.findByRole('dialog', { name: 'Add user' });
      expect(within(dialog).getByText('Exact OpenShift username, case-sensitive.')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('textbox', { name: /Username/ }));
      await user.paste('newbie');
      await user.click(within(dialog).getByRole('radio', { name: /Admin/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      expect(await screen.findByText('User newbie created')).toBeInTheDocument();
      await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/users/newbie'));
      expect(commands).toEqual([{ method: 'POST', path: '/api/admin/users', csrf: '1' }]);
      expect(mockDb.users.find((u) => u.username === 'newbie')?.isAdminByAssignment).toBe(true);
    },
  );

  it('USR-2: shows client, duplicate (409) and server 400 errors on the username field', async () => {
    const commands = recordCommands();
    const { user } = renderApp('/fleet/admin/users');
    await findUsersTable();
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add user' });
    const username = within(dialog).getByRole('textbox', { name: /Username/ });
    const create = within(dialog).getByRole('button', { name: 'Create' });

    await user.click(username);
    await user.paste('a/b');
    await user.click(create);
    expect(await within(dialog).findByText(/can't contain '\/', '%'/)).toBeInTheDocument();
    expect(commands).toEqual([]);

    await user.clear(username);
    await user.paste('alice');
    await user.click(create);
    expect(await within(dialog).findByText('User alice already exists.')).toBeInTheDocument();
    expect(username).toHaveValue('alice');

    server.use(
      http.post('/api/admin/users', () => validationProblem({ username: ['Server rejects this username.'] })),
    );
    await user.clear(username);
    await user.paste('fresh');
    await user.click(create);
    expect(await within(dialog).findByText('Server rejects this username.')).toBeInTheDocument();
  });

  it('USR-3/ADR-0017/USR-6: offers Promote/Demote by role source', async () => {
    const { user } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    expect(await openKebab(user, table, 'admin')).toEqual([
      'Grant access to clusters',
      'Promote to administrator',
      'Demote to user',
      'Set read-only',
      'Deactivate',
    ]);
    const demote = screen.getByRole('menuitem', { name: 'Demote to user' });
    expect(demote).toHaveAttribute('aria-disabled', 'true');
    await user.hover(demote);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Admin through group fleetconsole-admins. Remove it in the deployment settings.',
    );
    await user.keyboard('{Escape}');

    expect(await openKebab(user, table, 'carol')).toEqual([
      'Grant access to clusters',
      'Demote to user',
      'Set read-only',
      'Deactivate',
    ]);
    await user.keyboard('{Escape}');
    expect(await openKebab(user, table, 'alice')).toEqual([
      'Grant access to clusters',
      'Promote to administrator',
      'Set read-only',
      'Deactivate',
    ]);
  });

  it('ADR-0017: promoting a configuration admin explains why and records the role', async () => {
    const { user } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();
    await openKebab(user, table, 'admin');
    await user.click(screen.getByRole('menuitem', { name: 'Promote to administrator' }));
    const dialog = await screen.findByRole('dialog', { name: 'Promote admin to administrator?' });
    expect(dialog).toHaveTextContent(
      'admin is already an administrator through group fleetconsole-admins. Promoting records the role, so it is kept ' +
        'if the deployment settings change.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Promote' }));
    expect(await screen.findByText('admin is now an administrator')).toBeInTheDocument();
    expect(mockDb.users.find((u) => u.username === 'admin')?.isAdminByAssignment).toBe(true);
  });

  it('USR-4: deactivate names user and cluster count; reactivate restores the status', async () => {
    const { user } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    await openKebab(user, table, 'alice');
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate alice?' });
    expect(dialog).toHaveTextContent(
      'alice will be logged out within a minute and lose access to 3 clusters. Their grants are kept and return if ' +
        'reactivated.',
    );
    // The body doesn't repeat the title's question.
    expect(within(dialog).getAllByText(/Deactivate alice\?/)).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('alice deactivated')).toBeInTheDocument();
    expect(await within(rowOf(table, 'alice')).findByText('Deactivated')).toBeInTheDocument();

    expect(await openKebab(user, table, 'dave')).toContain('Reactivate');
    await user.click(screen.getByRole('menuitem', { name: 'Reactivate' }));
    const reactivate = await screen.findByRole('dialog', { name: 'Reactivate dave?' });
    await user.click(within(reactivate).getByRole('button', { name: 'Reactivate' }));
    expect(await screen.findByText('dave reactivated')).toBeInTheDocument();
    expect(await within(rowOf(table, 'dave')).findByText('Active')).toBeInTheDocument();
  });

  it('USR-4: deactivating a user without grants mentions no clusters or grants', async () => {
    const { user } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    await openKebab(user, table, 'bob');
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate bob?' });
    expect(within(dialog).getByText('bob will be logged out within a minute.')).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/grants|clusters/);
  });

  it('USR-5: sets read-only with the explanation', async () => {
    const { user } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();
    await openKebab(user, table, 'bob');
    await user.click(screen.getByRole('menuitem', { name: 'Set read-only' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make bob read-only?' });
    expect(dialog).toHaveTextContent(
      "Read-only users can't change anything on any cluster or in Fleet administration.",
    );
    await user.click(within(dialog).getByRole('button', { name: 'Set read-only' }));
    expect(await screen.findByText('bob is now read-only')).toBeInTheDocument();
    expect(await within(rowOf(table, 'bob')).findByText('Read only')).toBeInTheDocument();
  });

  it('ADM-5: own Demote and Deactivate are disabled; Users.LastAdmin is shown in the dialog', async () => {
    setMockUser('carol');
    server.use(
      http.post('/api/admin/users/{username}/deactivate', () =>
        problem(409, {
          code: 'Users.LastAdmin',
          detail: 'admin is the last active administrator who can make changes. Promote another user first.',
        }),
      ),
    );
    const { user } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    await openKebab(user, table, 'carol');
    for (const name of ['Demote to user', 'Deactivate']) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    await user.hover(screen.getByRole('menuitem', { name: 'Deactivate' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent("You can't demote or deactivate yourself.");
    await user.keyboard('{Escape}');

    await openKebab(user, table, 'admin');
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate admin?' });
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(
      await within(dialog).findByText(
        'admin is the last active administrator who can make changes. Promote another user first.',
      ),
    ).toBeInTheDocument();
  });

  it('ADM-4: a version conflict shows the detail inline and a second confirm succeeds', async () => {
    const { user, queryClient } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();
    bumpVersion('alice');

    await openKebab(user, table, 'alice');
    await user.click(screen.getByRole('menuitem', { name: 'Set read-only' }));
    const dialog = await screen.findByRole('dialog', { name: 'Make alice read-only?' });
    const confirm = within(dialog).getByRole('button', { name: 'Set read-only' });
    await user.click(confirm);
    expect(await within(dialog).findByText(/changed by someone else/)).toBeInTheDocument();

    // The conflict refetched the users list; the dialog now carries the fresh version.
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    await user.click(confirm);
    expect(await screen.findByText('alice is now read-only')).toBeInTheDocument();
  });

  it('ADM-2: as a read-only admin every action is visible but disabled and sends nothing', async () => {
    setMockUser('ines');
    const commands = recordCommands();
    const { user } = renderApp('/fleet/admin/users');
    const table = await findUsersTable();

    const add = screen.getByRole('button', { name: 'Add user' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    await user.click(add);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openKebab(user, table, 'alice');
    const items = screen.getAllByRole('menuitem');
    for (const item of items) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
    }
    await user.hover(screen.getByRole('menuitem', { name: 'Deactivate' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your account is read-only');
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(commands).toEqual([]);
  });
});
