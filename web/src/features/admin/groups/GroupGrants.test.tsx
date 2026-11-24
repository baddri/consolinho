import { screen, waitFor, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { credentialIds, http, mockDb, setMockHostGroups, setMockUser, validationProblem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';

type User = ReturnType<typeof renderApp>['user'];

/** Opens the bulk grant wizard from the tab's "Grant access" and waits for the cluster table. */
async function openWizard(user: User, groupName: string) {
  const [button] = await screen.findAllByRole('button', { name: 'Grant access' });
  if (!button) throw new Error('no Grant access button');
  await user.click(button);
  const dialog = await screen.findByRole('dialog', { name: `Grant group ${groupName} access to clusters` });
  await within(dialog).findByRole('grid', { name: 'Clusters to grant' });
  return dialog;
}

/** Selects `clusters` in step 1, then enters `priority` on the access mode step (Next waits for it). */
async function selectAndPrioritize(user: User, dialog: HTMLElement, clusters: string[], priority: string) {
  for (const cluster of clusters) {
    await user.click(within(dialog).getByRole('checkbox', { name: `Select ${cluster}` }));
  }
  await user.click(within(dialog).getByRole('button', { name: 'Next' }));
  expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled();
  await user.type(within(dialog).getByRole('spinbutton', { name: 'Priority' }), priority);
  await user.click(within(dialog).getByRole('button', { name: 'Next' }));
}

/** Body rows of the review table. */
const reviewRows = (dialog: HTMLElement) =>
  within(within(dialog).getByRole('grid', { name: 'Clusters to grant access to' }))
    .getAllByRole('row')
    .slice(1);

/** Records the JSON bodies of group bulk grant requests, then lets the mock backend answer. */
function captureGroupBulk() {
  const bodies: unknown[] = [];
  server.use(
    http.post('/api/admin/groups/{groupName}/grants/bulk', async ({ request }) => {
      bodies.push(await request.clone().json());
      return undefined;
    }),
  );
  return bodies;
}

beforeEach(() => mockViewportWidth(1440));

describe('Group Cluster access tab and bulk grant (T-0264)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    "GPG-2: Cluster access is a URL tab listing the group's grants with priority",
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user, router } = renderApp('/fleet/admin/groups/sre');
      await user.click(await screen.findByRole('tab', { name: 'Cluster access' }, { timeout: COLD_START_TIMEOUT_MS }));

      expect(router.state.location.pathname).toBe('/fleet/admin/groups/sre/access');
      const table = await screen.findByRole('grid', { name: 'Cluster access of group sre' });
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((th) => th.textContent),
      ).toEqual(['Cluster', 'Access mode', 'Priority', 'Credential', 'Granted', 'Actions']);
      const row = (await within(table).findByRole('link', { name: /staging-eu-1/ })).closest('tr');
      if (!row) throw new Error('no row for staging-eu-1');
      expect(within(row).getByText('100')).toBeInTheDocument();
      expect(within(table).getAllByRole('row')).toHaveLength(2);
      expect(screen.getByRole('tabpanel', { name: 'Cluster access' })).toBeInTheDocument();
    },
  );

  it('GPG-2: a group without grants explains what its members miss', async () => {
    setMockHostGroups([{ name: 'qa', users: ['bob'] }]);
    renderApp('/fleet/admin/groups/qa/access');

    expect(await screen.findByText('No cluster access yet')).toBeInTheDocument();
    expect(
      screen.getByText("Members of qa can't reach any cluster through this group until you grant access."),
    ).toBeInTheDocument();
  });

  it('GPG-3: grants the selected clusters with one priority and toasts the count', async () => {
    const bodies = captureGroupBulk();
    const { user } = renderApp('/fleet/admin/groups/sre/access');
    const dialog = await openWizard(user, 'sre');

    // The group's own grant marks staging-eu-1 as already granted.
    expect(within(dialog).getByRole('checkbox', { name: 'Select staging-eu-1' })).toBeDisabled();
    await selectAndPrioritize(user, dialog, ['dev-1', 'dev-2'], '20');
    // The review restates the one priority chosen for every cluster.
    expect(within(dialog).getByText('Read only access with priority 20 to 2 clusters.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByText('Granted group sre read only on 2 clusters')).toBeInTheDocument();
    expect(bodies).toEqual([
      {
        accessMode: 'readOnly',
        priority: 20,
        items: [
          { clusterName: 'dev-1', credentialId: credentialIds.dev1Edit },
          { clusterName: 'dev-2', credentialId: credentialIds.dev2View },
        ],
      },
    ]);
    const table = await screen.findByRole('grid', { name: 'Cluster access of group sre' });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(4));
  });

  it('GPG-3: a taken priority flags exactly that row, writes nothing, and Remove lets the rest go through', async () => {
    setMockHostGroups([{ name: 'qa', users: ['bob'] }]);
    const grantsBefore = mockDb.grants.length;
    const { user } = renderApp('/fleet/admin/groups/qa/access');
    const dialog = await openWizard(user, 'qa');
    // `platform` holds priority 10 on staging-eu-1.
    await selectAndPrioritize(user, dialog, ['dev-1', 'staging-eu-1'], '10');
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));

    const message = 'Priority 10 is already used by group platform on this cluster.';
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Nothing was granted. Remove the flagged clusters or change the priority, then select Grant access again.',
      ),
    ).toBeInTheDocument();
    // A priority conflict is not the credential's fault.
    expect(within(dialog).getByRole('button', { name: 'Credential for staging-eu-1' })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    const [devRow, stagingRow] = reviewRows(dialog);
    expect(within(stagingRow ?? dialog).getByText(message)).toBeInTheDocument();
    expect(within(devRow ?? dialog).queryByText(message)).not.toBeInTheDocument();
    expect(within(devRow ?? dialog).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    expect(mockDb.grants).toHaveLength(grantsBefore);

    await user.click(within(dialog).getByRole('button', { name: 'Remove staging-eu-1' }));
    expect(reviewRows(dialog)).toHaveLength(1);
    expect(within(dialog).queryByText(message)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByText('Granted group qa read only on 1 cluster')).toBeInTheDocument();
    expect(mockDb.grants).toHaveLength(grantsBefore + 1);
  });

  it('GPG-3: Back to change a taken priority, then resubmitting, grants every cluster', async () => {
    setMockHostGroups([{ name: 'qa', users: ['bob'] }]);
    const bodies = captureGroupBulk();
    const { user } = renderApp('/fleet/admin/groups/qa/access');
    const dialog = await openWizard(user, 'qa');
    await selectAndPrioritize(user, dialog, ['dev-1', 'staging-eu-1'], '10');
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    await within(dialog).findByText('Priority 10 is already used by group platform on this cluster.');

    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    const priority = within(dialog).getByRole('spinbutton', { name: 'Priority' });
    await user.clear(priority);
    await user.type(priority, '11');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByText('Granted group qa read only on 2 clusters')).toBeInTheDocument();
    expect(bodies.at(-1)).toMatchObject({ priority: 11 });
  });

  it('GPG-3: Remove on one of two flagged rows keeps the other flagged', async () => {
    server.use(
      http.post('/api/admin/groups/{groupName}/grants/bulk', () =>
        validationProblem({
          'items[0].clusterName': ['Cluster dev-1 was not found.'],
          'items[1].clusterName': ['Cluster dev-2 was not found.'],
        }),
      ),
    );
    const { user } = renderApp('/fleet/admin/groups/sre/access');
    const dialog = await openWizard(user, 'sre');
    await selectAndPrioritize(user, dialog, ['dev-1', 'dev-2'], '20');
    await user.click(within(dialog).getByRole('button', { name: 'Grant access' }));
    await within(dialog).findByText('Cluster dev-1 was not found.');

    await user.click(within(dialog).getByRole('button', { name: 'Remove dev-1' }));
    const [remaining] = reviewRows(dialog);
    expect(reviewRows(dialog)).toHaveLength(1);
    expect(within(remaining ?? dialog).getByText('Cluster dev-2 was not found.')).toBeInTheDocument();
    expect(within(remaining ?? dialog).getByRole('button', { name: 'Remove dev-2' })).toBeInTheDocument();
    expect(within(dialog).queryByText('Cluster dev-1 was not found.')).not.toBeInTheDocument();
  });

  it('GPG-3: warns that members can change production clusters', async () => {
    const { user } = renderApp('/fleet/admin/groups/sre/access');
    const dialog = await openWizard(user, 'sre');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Select prod-eu-1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    await user.click(within(dialog).getByRole('radio', { name: /Read write/ }));
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Priority' }), '5');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));

    expect(
      within(dialog).getByText('Members of sre will be able to change production clusters: prod-eu-1.'),
    ).toBeInTheDocument();
  });

  it('GPG-3: an out-of-range priority shows the range error and keeps Next disabled', async () => {
    const { user } = renderApp('/fleet/admin/groups/sre/access');
    const dialog = await openWizard(user, 'sre');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Select dev-1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Priority' }), '2000');

    expect(await within(dialog).findByText('Priority must be between 1 and 1000.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('UIG-6: a read-only admin sees Grant access, Edit and Revoke disabled', async () => {
    setMockUser('ines');
    const { user } = renderApp('/fleet/admin/groups/sre/access');
    const table = await screen.findByRole('grid', { name: 'Cluster access of group sre' });

    const grant = screen.getByRole('button', { name: 'Grant access' });
    expect(grant).toHaveAttribute('aria-disabled', 'true');
    await user.click(grant);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(await within(table).findByRole('button', { name: 'Kebab toggle' }));
    expect(await screen.findByRole('menuitem', { name: 'Edit access' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Revoke access' })).toHaveAttribute('aria-disabled', 'true');
  });
});
