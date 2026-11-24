import { screen, waitFor, within } from '@testing-library/react';
import {
  credentialIds,
  grantIds,
  http,
  problem,
  setMockHostGroups,
  validationProblem,
} from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';

type User = ReturnType<typeof renderApp>['user'];

const HELPER =
  'When a user is in several groups with access to this cluster, the highest priority wins. A direct user grant always wins.';

/** Opens "Grant access" on `cluster`'s Access tab and returns the dialog. */
async function openCreate(cluster: string) {
  const result = renderApp(`/fleet/admin/clusters/${cluster}/access`);
  const [button] = await screen.findAllByRole('button', { name: 'Grant access' });
  if (!button) throw new Error('No Grant access button');
  await result.user.click(button);
  const dialog = await screen.findByRole('dialog', { name: new RegExp(`Grant access to ${cluster}`) });
  return { ...result, dialog };
}

/** Switches the dialog to Group and enters `name` through the `Use "<name>"` free-text item. */
async function typeGroup(user: User, dialog: HTMLElement, name: string) {
  await user.click(within(dialog).getByRole('radio', { name: 'Group' }));
  await user.click(within(dialog).getByRole('combobox', { name: 'Subject name' }));
  await user.paste(name);
  await user.click(await screen.findByRole('option', { name: new RegExp(`^Use "${name}"`) }));
}

/** Replaces the Priority value with `value`. */
async function setPriority(user: User, dialog: HTMLElement, value: string) {
  const input = within(dialog).getByRole('spinbutton', { name: 'Priority' });
  await user.clear(input);
  await user.type(input, value);
}

/** Records the bodies of group grant creations and grant updates, then lets the mock backend answer. */
function captureWrites() {
  const writes: { url: string; body: unknown }[] = [];
  const record = async (request: Request) => {
    writes.push({ url: new URL(request.url).pathname, body: await request.clone().json() });
    return undefined;
  };
  server.use(
    http.post('/api/admin/groups/{groupName}/grants', ({ request }) => record(request)),
    http.put('/api/admin/grants/{grantId}', ({ request }) => record(request)),
  );
  return writes;
}

beforeEach(() => mockViewportWidth(1440));

describe('Grant access dialog — Subject section (T-0262)', () => {
  it('UIG-1/3: User by default; Group clears the name, focuses it and adds Priority with used values', async () => {
    const { user, dialog } = await openCreate('staging-eu-1');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Subject' })).toBeInTheDocument();
    // Access fields sit in their own titled section, so the gap after Subject is section spacing (OCP `bindings.tsx`).
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Access' })).toBeInTheDocument();
    const kinds = within(dialog).getByRole('radiogroup', { name: 'Subject kind' });
    expect(within(kinds).getByRole('radio', { name: 'User' })).toBeChecked();
    expect(within(dialog).queryByRole('spinbutton', { name: 'Priority' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('combobox', { name: 'Subject name' }));
    await user.paste('bob');
    await user.click(await screen.findByRole('option', { name: /^bob/ }));
    await user.click(within(kinds).getByRole('radio', { name: 'Group' }));

    const name = within(dialog).getByRole('combobox', { name: 'Subject name' });
    expect(name).toHaveValue('');
    await waitFor(() => expect(name).toHaveFocus());
    expect(within(dialog).getByRole('spinbutton', { name: 'Priority' })).toHaveValue(null);
    expect(within(dialog).getByText(HELPER)).toBeInTheDocument();
    expect(within(dialog).getByText('Used on this cluster: 100 (sre), 50 (ghost-team), 10 (platform).')).toBeInTheDocument();

    await user.click(within(kinds).getByRole('radio', { name: 'User' }));
    expect(within(dialog).queryByRole('spinbutton', { name: 'Priority' })).not.toBeInTheDocument();
  });

  it('UIG-2/3: lists host groups, offers free text, checks the priority and creates the group grant', async () => {
    const writes = captureWrites();
    const { user, dialog } = await openCreate('staging-eu-1');
    await user.click(within(dialog).getByRole('radio', { name: 'Group' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Subject name' }));
    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'auditors',
      'ghost-teamNot found on host cluster · already has access',
      'platformalready has access',
      'srealready has access',
    ]);
    await user.paste('new-team');
    await user.click(await screen.findByRole('option', { name: 'Use "new-team"' }));

    // Submitting without a priority, then with a taken one, stays client-side.
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    const priority = within(dialog).getByRole('spinbutton', { name: 'Priority' });
    expect(priority).toHaveAccessibleDescription(
      expect.stringContaining('Priority must be between 1 and 1000.'),
    );
    await setPriority(user, dialog, '100');
    expect(priority).toHaveAccessibleDescription(
      expect.stringContaining('Priority 100 is already used by group sre on this cluster.'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    expect(writes).toEqual([]);

    await setPriority(user, dialog, '300');
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    expect(await screen.findByText('Granted group new-team read only on staging-eu-1')).toBeInTheDocument();
    expect(writes).toEqual([
      {
        url: '/api/admin/groups/new-team/grants',
        body: {
          clusterName: 'staging-eu-1',
          credentialId: credentialIds.stagingAdmin,
          accessMode: 'readOnly',
          priority: 300,
        },
      },
    ]);
  });

  it('UIG-2: a failed host listing shows the info alert and a typed group can still be granted', async () => {
    setMockHostGroups('forbidden');
    const { user, dialog } = await openCreate('staging-eu-1');
    await typeGroup(user, dialog, 'platform-ops');
    expect(
      within(dialog).getByText('Could not list groups on the host cluster. You can still type a group name.'),
    ).toBeInTheDocument();
    await setPriority(user, dialog, '20');
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    expect(
      await screen.findByText('Granted group platform-ops read only on staging-eu-1'),
    ).toBeInTheDocument();
  });

  it('GRP-3/GRP-6: invalid group names are refused on Subject name, client-side and from the Api', async () => {
    const { user, dialog } = await openCreate('staging-eu-1');
    await typeGroup(user, dialog, 'SYSTEM:masters');
    await setPriority(user, dialog, '5');
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    const name = within(dialog).getByRole('combobox', { name: 'Subject name' });
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining("System groups can't be granted access."),
      ),
    );

    server.use(
      http.post('/api/admin/groups/{groupName}/grants', () =>
        validationProblem({ groupName: ['Enter a valid group name.'] }),
      ),
    );
    await user.clear(name);
    await user.paste('ok-team');
    await user.click(await screen.findByRole('option', { name: 'Use "ok-team"' }));
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    await waitFor(() =>
      expect(name).toHaveAccessibleDescription(expect.stringContaining('Enter a valid group name.')),
    );
  });

  it('GRP-4: a 409 Grants.PriorityTaken lands on Priority', async () => {
    server.use(
      http.post('/api/admin/groups/{groupName}/grants', () =>
        problem(409, {
          code: 'Grants.PriorityTaken',
          detail: 'Priority 7 is already used by group `late` on this cluster.',
        }),
      ),
    );
    const { user, dialog } = await openCreate('staging-eu-1');
    await typeGroup(user, dialog, 'ops');
    await setPriority(user, dialog, '7');
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('spinbutton', { name: 'Priority' })).toHaveAccessibleDescription(
        expect.stringContaining('Priority 7 is already used by group late on this cluster.'),
      ),
    );
  });

  it('UIG-5: read write on a production cluster warns about the group', async () => {
    const { user, dialog } = await openCreate('prod-us-1');
    await typeGroup(user, dialog, 'ops');
    await user.click(within(dialog).getByRole('radio', { name: /Read write/ }));
    expect(
      within(dialog).getByText('Members of ops will be able to change resources on prod-us-1.'),
    ).toBeInTheDocument();
  });

  it('edits a group grant: priority, mode and credential with the version', async () => {
    const writes = captureWrites();
    const { user } = renderApp('/fleet/admin/clusters/staging-eu-1/access');
    const table = await screen.findByRole('grid', { name: /staging-eu-1/ });
    const row = (await within(table).findByRole('link', { name: 'sre' })).closest('tr');
    if (!row) throw new Error('No sre row');
    await user.click(within(row).getByRole('button', { name: 'Kebab toggle' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit access' }));
    const dialog = await screen.findByRole('dialog', { name: /Edit access of group sre to staging-eu-1/ });
    expect(within(dialog).queryByRole('radiogroup', { name: 'Subject kind' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('spinbutton', { name: 'Priority' })).toHaveValue(100);
    expect(await within(dialog).findByText('Used on this cluster: 50 (ghost-team), 10 (platform).')).toBeInTheDocument();

    await setPriority(user, dialog, '150');
    await user.click(within(dialog).getByRole('radio', { name: /Read write/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Changed access of group sre to staging-eu-1')).toBeInTheDocument();
    expect(writes).toEqual([
      {
        url: `/api/admin/grants/${grantIds.sreStaging}`,
        body: {
          accessMode: 'readWrite',
          credentialId: credentialIds.stagingAdmin,
          priority: 150,
          version: 1,
        },
      },
    ]);
  });
});
