import { screen, waitFor, within } from '@testing-library/react';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import { CSRF_HEADER } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import {
  clearClusterAccess,
  credentialIds,
  http,
  mockDb,
  setMockUser,
  validationProblem,
} from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../../routes';

type User = ReturnType<typeof renderApp>['user'];

/**
 * Opens the wizard from the "Grant access" button of the user's Cluster access tab (the page's one grant entry point,
 * T-0118 #9; an empty tab repeats it in its empty state) and waits for the cluster table.
 */
async function openWizard(user: User, username: string, timeout?: number) {
  const [button] = await screen.findAllByRole('button', { name: 'Grant access' }, { timeout });
  if (!button) throw new Error('no Grant access button');
  await user.click(button);
  const dialog = await screen.findByRole('dialog', { name: `Grant ${username} access to clusters` });
  await within(dialog).findByRole('grid', { name: 'Clusters to grant' });
  return dialog;
}

/** The checkbox of `cluster` in step 1. */
const checkboxOf = (dialog: HTMLElement, cluster: string) =>
  within(dialog).getByRole('checkbox', { name: `Select ${cluster}` });

/** Body rows of the review table. */
function reviewRows(dialog: HTMLElement): HTMLElement[] {
  return within(within(dialog).getByRole('grid', { name: 'Clusters to grant access to' }))
    .getAllByRole('row')
    .slice(1);
}

/** Clicks the wizard footer button `name`. */
const footer = (user: User, dialog: HTMLElement, name: string) =>
  user.click(within(dialog).getByRole('button', { name }));

/** Records the JSON body and CSRF header of bulk grant requests, then lets the mock backend answer. */
function captureBulk() {
  const requests: { body: unknown; csrf: string | null }[] = [];
  server.use(
    http.post('/api/admin/users/{username}/grants/bulk', async ({ request }) => {
      requests.push({ body: await request.clone().json(), csrf: request.headers.get(CSRF_HEADER) });
      return undefined;
    }),
  );
  return requests;
}

beforeEach(() => mockViewportWidth(1440));

describe('Bulk grant wizard (T-0040)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'GRANT-4: selects clusters, pre-fills credentials, blocks until complete and grants all in order',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      // lab-1 stands in for a cluster without credentials (and drops alice's lab-1 grant).
      clearClusterAccess('lab-1');
      const requests = captureBulk();
      const { user, queryClient } = renderApp('/fleet/admin/users/alice/access');
      const dialog = await openWizard(user, 'alice', COLD_START_TIMEOUT_MS);

      // Already granted and credential-less clusters are listed but not selectable.
      expect(checkboxOf(dialog, 'prod-eu-1')).toBeDisabled();
      expect(within(dialog).getAllByText('already has access')).toHaveLength(3);
      expect(checkboxOf(dialog, 'lab-1')).toBeDisabled();
      expect(within(dialog).getByText('no credentials')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled();

      for (const cluster of ['dev-2', 'prod-us-1', 'dev-1']) await user.click(checkboxOf(dialog, cluster));
      await footer(user, dialog, 'Next');
      expect(within(dialog).getByRole('radio', { name: /Read only/ })).toBeChecked();
      await footer(user, dialog, 'Next');

      // Table (name) order, not click order; single-credential clusters pre-filled, prod-us-1 (two credentials, no
      // preferred name) empty.
      const rows = reviewRows(dialog);
      expect(within(dialog).getByText(/^Read only access to 3 clusters\./)).toBeInTheDocument();
      expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
        'dev-1',
        'dev-2',
        'prod-us-1',
      ]);
      expect(within(dialog).getByRole('button', { name: 'Credential for prod-us-1' })).toHaveTextContent(
        'Select a credential',
      );
      expect(within(dialog).getByRole('button', { name: 'Credential for dev-1' })).toHaveTextContent(
        'fleet-edit',
      );
      expect(within(dialog).getByRole('button', { name: 'Grant access' })).toBeDisabled();

      // A preferred name pre-fills the matching credential.
      await footer(user, dialog, 'Back');
      await user.click(within(dialog).getByRole('textbox', { name: 'Preferred credential name' }));
      await user.paste('fleet-view');
      await footer(user, dialog, 'Next');
      expect(within(dialog).getByRole('button', { name: 'Credential for prod-us-1' })).toHaveTextContent(
        'fleet-view',
      );

      await waitFor(() => expect(queryClient.getQueryData(accessibleClustersQueryKey)).toBeDefined());
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      await footer(user, dialog, 'Grant access');

      expect(await screen.findByText('Granted alice ReadOnly on 3 clusters')).toBeInTheDocument();
      expect(requests).toEqual([
        {
          csrf: '1',
          body: {
            accessMode: 'readOnly',
            items: [
              { clusterName: 'dev-1', credentialId: credentialIds.dev1Edit },
              { clusterName: 'dev-2', credentialId: credentialIds.dev2View },
              { clusterName: 'prod-us-1', credentialId: credentialIds.prodUsView },
            ],
          },
        },
      ]);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: accessibleClustersQueryKey });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const table = await screen.findByRole('grid', { name: 'Cluster access of alice' });
      await waitFor(() =>
        expect(
          within(table)
            .getAllByRole('link')
            .map((link) => link.textContent)
            .sort(),
        ).toEqual(['dev-1', 'dev-2', 'prod-eu-1', 'prod-k8s-1', 'prod-us-1', 'staging-eu-1']),
      );
    },
  );

  it('has exactly one close control (the wizard header X) and closes on Escape', async () => {
    const { user } = renderApp('/fleet/admin/users/bob/access');
    const dialog = await openWizard(user, 'bob', COLD_START_TIMEOUT_MS);

    expect(within(dialog).getAllByRole('button', { name: /close/i })).toHaveLength(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('GRANT-4: highlights production rows and warns about read write on them', async () => {
    clearClusterAccess('lab-1');
    const { user } = renderApp('/fleet/admin/users/bob/access');
    const dialog = await openWizard(user, 'bob', COLD_START_TIMEOUT_MS);

    // Keyboard: the per-cluster checkboxes are labelled and toggle with Space.
    checkboxOf(dialog, 'prod-eu-1').focus();
    await user.keyboard(' ');
    expect(checkboxOf(dialog, 'prod-eu-1')).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Select all visible clusters' }));
    expect(checkboxOf(dialog, 'dev-2')).toBeChecked();
    expect(checkboxOf(dialog, 'lab-1')).not.toBeChecked();

    await footer(user, dialog, 'Next');
    await user.click(within(dialog).getByRole('radio', { name: /Read write/ }));
    await footer(user, dialog, 'Next');

    expect(
      within(dialog).getByText('This user will be able to change production clusters: prod-eu-1, prod-k8s-1, prod-us-1.'),
    ).toBeInTheDocument();
    const highlighted = reviewRows(dialog)
      .filter((row) => row.classList.contains('pf-m-selected'))
      .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
    expect(highlighted).toEqual(['prod-eu-1', 'prod-k8s-1', 'prod-us-1']);
  });

  it('GRANT-4: a 400 on items[1].credentialId marks row 2, keeps the selection and creates nothing', async () => {
    server.use(
      http.post('/api/admin/users/{username}/grants/bulk', () =>
        validationProblem({ 'items[1].credentialId': ['Credential fleet-edit was deleted.'] }),
      ),
    );
    const grantsBefore = mockDb.grants.length;
    const { user } = renderApp('/fleet/admin/users/alice/access');
    const dialog = await openWizard(user, 'alice', COLD_START_TIMEOUT_MS);
    for (const cluster of ['dev-1', 'dev-2']) await user.click(checkboxOf(dialog, cluster));
    await footer(user, dialog, 'Next');
    await footer(user, dialog, 'Next');
    await footer(user, dialog, 'Grant access');

    expect(await within(dialog).findByText('Credential fleet-edit was deleted.')).toBeInTheDocument();
    const [first, second] = reviewRows(dialog);
    expect(within(second ?? dialog).getByText('Credential fleet-edit was deleted.')).toBeInTheDocument();
    expect(within(first ?? dialog).queryByText('Credential fleet-edit was deleted.')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Credential for dev-2' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(reviewRows(dialog)).toHaveLength(2);
    expect(mockDb.grants).toHaveLength(grantsBefore);

    await footer(user, dialog, 'Back');
    await footer(user, dialog, 'Back');
    expect(checkboxOf(dialog, 'dev-1')).toBeChecked();
    expect(checkboxOf(dialog, 'dev-2')).toBeChecked();
  });

  it('USR-2: "Create and grant access" opens the wizard for the new user', async () => {
    const { user, router } = renderApp('/fleet/admin/users');
    const [add] = await screen.findAllByRole(
      'button',
      { name: 'Add user' },
      { timeout: COLD_START_TIMEOUT_MS },
    );
    if (!add) throw new Error('no Add user');
    await user.click(add);
    const create = await screen.findByRole('dialog', { name: 'Add user' });
    await user.click(within(create).getByRole('textbox', { name: /Username/ }));
    await user.paste('newbie');
    await user.click(within(create).getByRole('button', { name: 'Create and grant access' }));

    const dialog = await screen.findByRole('dialog', { name: 'Grant newbie access to clusters' });
    expect(router.state.location.pathname).toBe('/fleet/admin/users/newbie/access');
    expect(router.state.location.state).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('ADM-2: a read-only admin sees every entry point disabled', async () => {
    setMockUser('ines');
    const { user } = renderApp('/fleet/admin/users/bob/access');
    await screen.findByText('No cluster access yet', {}, { timeout: COLD_START_TIMEOUT_MS });
    // The toolbar's button and the empty state's; the Actions menu has no grant item (T-0118 #9).
    const buttons = screen.getAllByRole('button', { name: 'Grant access' });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: 'Grant access to clusters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
