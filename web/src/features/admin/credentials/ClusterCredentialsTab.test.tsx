import { screen, waitFor, within } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { credentialIds, http, mockDb, problem, setMockUser, validationProblem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';
import { withoutBadges } from '../dataViewTestUtils';

/** Fake tokens only. A JWT for `system:serviceaccount:fleetconsole:fleet-ops`, expiring in 2100. */
const JWT_TOKEN = [
  'eyJhbGciOiJub25lIn0',
  btoa(JSON.stringify({ sub: 'system:serviceaccount:fleetconsole:fleet-ops', iat: 1_700_000_000, exp: 4_102_444_800 }))
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_'),
  'fake-signature',
].join('.');
const OPAQUE_TOKEN = 'sha256~fake-opaque-token-for-tests';

/** Waits for the credentials table of `cluster`. */
async function findTable(cluster: string, timeout?: number) {
  const table = await screen.findByRole('grid', { name: `Credentials of ${cluster}` }, { timeout });
  await within(table).findAllByRole('button', { name: 'Kebab toggle' }, { timeout });
  return table;
}

/** The body row whose first cell is `name`. */
function rowOf(table: HTMLElement, name: string): HTMLElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => withoutBadges(within(candidate).queryAllByRole('cell')[0]).startsWith(name));
  if (!row) throw new Error(`No row ${name}`);
  return row;
}

/** Text of the cell with `dataLabel` in `row`. */
function cellText(row: HTMLElement, label: string): string {
  return row.querySelector(`[data-label="${label}"]`)?.textContent ?? '';
}

/** Opens the row kebab of `name` and clicks `action`. */
async function rowAction(user: ReturnType<typeof renderApp>['user'], table: HTMLElement, name: string, action: string) {
  await user.click(within(rowOf(table, name)).getByRole('button', { name: 'Kebab toggle' }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

/** Asserts `token` is nowhere: not in an input, not in rendered text, not in the query or mutation caches. */
function expectTokenGone(token: string, queryClient: QueryClient) {
  expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
  expect(document.body.textContent).not.toContain(token);
  const queries = queryClient.getQueryCache().getAll();
  expect(JSON.stringify(queries.map((query) => [query.queryKey, query.state.data]))).not.toContain(token);
  const mutations = queryClient.getMutationCache().getAll();
  expect(JSON.stringify(mutations.map((mutation) => mutation.state.variables ?? null))).not.toContain(token);
}

/** Records the JSON body and CSRF header of credential writes, then lets the mock backend answer. */
function captureCredentialWrites() {
  const writes: { body: unknown; csrf: string | null }[] = [];
  const record = async (request: Request) => {
    writes.push({ body: await request.clone().json(), csrf: request.headers.get('X-Console-Request') });
    return undefined;
  };
  server.use(
    http.post('/api/admin/clusters/{name}/credentials', ({ request }) => record(request)),
    http.put('/api/admin/clusters/{name}/credentials/{credentialId}/token', ({ request }) => record(request)),
  );
  return writes;
}

beforeEach(() => mockViewportWidth(1440));

describe('ClusterCredentialsTab (T-0036)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'CRED-3/4: prod-us-1 shows SA identity, opaque warning, expired/unknown expiry and test results',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp('/admin/clusters/prod-us-1/credentials');
      const table = await findTable('prod-us-1', COLD_START_TIMEOUT_MS);

      const view = rowOf(table, 'fleet-view');
      expect(cellText(view, 'Service account')).toBe('fleetconsole/fleet-view');
      expect(cellText(view, 'Fingerprint')).toBe(
        mockDb.credentials.find((c) => c.id === credentialIds.prodUsView)?.fingerprint,
      );
      expect(cellText(view, 'Expiry')).toMatch(/^Expired\d+ days ago$/);
      expect(cellText(view, 'Grants')).toBe('1');
      expect(cellText(view, 'Last test')).toMatch(/^Failed at Authentication/);
      expect(cellText(view, 'Rotated')).toBe('Never');

      const legacy = rowOf(table, 'legacy-token');
      expect(cellText(legacy, 'Name')).toContain('Opaque token from the old tooling');
      expect(cellText(legacy, 'Service account')).toBe('Not a ServiceAccount token');
      expect(cellText(legacy, 'Expiry')).toBe('Unknown');
      expect(cellText(legacy, 'Last test')).toBe('Never tested');

      await user.hover(within(legacy).getByText('Not a ServiceAccount token'));
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        "Expiry unknown and it is tied to a person's account.",
      );
    },
  );

  it('CRED-4: valid, expiring-soon, no-expiry and stale-test variants', async () => {
    renderApp('/admin/clusters/prod-eu-1/credentials');
    let table = await findTable('prod-eu-1');
    expect(cellText(rowOf(table, 'fleet-view'), 'Expiry')).toMatch(/^Validin /);
    expect(cellText(rowOf(table, 'fleet-view'), 'Last test')).toMatch(/^Passed · Cluster-wide view/);
    expect(cellText(rowOf(table, 'fleet-edit'), 'Expiry')).toMatch(/^Expires soonin \d+ days$/);

    renderApp('/admin/clusters/staging-eu-1/credentials');
    table = await findTable('staging-eu-1');
    const admin = rowOf(table, 'fleet-admin');
    expect(cellText(admin, 'Expiry')).toBe('No expiry');
    expect(cellText(admin, 'Last test')).toContain('Settings changed since last test');
    expect(cellText(admin, 'Rotated')).toMatch(/ by carol$/);
  });

  it('QG-3: empty state offers Add credential and the oc command', async () => {
    renderApp('/admin/clusters/lab-1/credentials');
    expect(await screen.findByRole('heading', { name: 'No credentials' })).toBeInTheDocument();
    expect(screen.getByText(/Users can't be granted access until you add a ServiceAccount token/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('oc create token <service-account> -n <namespace> --duration=8760h')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Add credential' })).toHaveLength(2);
  });

  it('QG-3: an error shows ErrorState with Retry', async () => {
    server.use(
      http.get('/api/admin/clusters/{name}/credentials', () =>
        problem(500, { code: 'Internal', detail: 'Database unavailable.' }),
      ),
    );
    renderApp('/admin/clusters/prod-eu-1/credentials');
    expect(await screen.findByText('Could not load credentials')).toBeInTheDocument();
    expect(screen.getByText('Database unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('grid', { name: 'Credentials of prod-eu-1' })).not.toBeInTheDocument();
  });

  it('ADM-2: a read-only admin sees Add, Rotate and Delete disabled', async () => {
    setMockUser('ines');
    const { user } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findTable('prod-eu-1');
    expect(screen.getByRole('button', { name: 'Add credential' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(within(rowOf(table, 'fleet-view')).getByRole('button', { name: 'Kebab toggle' }));
    expect(await screen.findByRole('menuitem', { name: 'Rotate token' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('CRED-1/2: add trims the token, sends CSRF, toasts and forgets the token', async () => {
    const writes = captureCredentialWrites();
    const { user, queryClient } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findTable('prod-eu-1');

    await user.click(screen.getByRole('button', { name: 'Add credential' }));
    const dialog = await screen.findByRole('dialog', { name: /Add credential to prod-eu-1/ });
    const tokenInput = within(dialog).getByLabelText(/^Token/, { selector: 'input' });
    expect(tokenInput).toHaveAttribute('type', 'password');
    expect(tokenInput).toHaveAttribute('autocomplete', 'off');
    expect(tokenInput).toHaveAttribute('spellcheck', 'false');

    await user.type(within(dialog).getByLabelText(/^Name/), 'fleet-ops');
    await user.click(tokenInput);
    await user.paste(`  ${JWT_TOKEN}\n`);
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('Credential fleet-ops added to prod-eu-1')).toBeInTheDocument();
    expect(writes).toEqual([{ body: { name: 'fleet-ops', description: null, token: JWT_TOKEN }, csrf: '1' }]);
    await waitFor(() => expect(cellText(rowOf(table, 'fleet-ops'), 'Service account')).toBe('fleetconsole/fleet-ops'));
    expect(screen.queryByText('Not a ServiceAccount token')).not.toBeInTheDocument();
    expectTokenGone(JWT_TOKEN, queryClient);

    // Reopening starts empty.
    await user.click(screen.getByRole('button', { name: 'Add credential' }));
    const reopened = await screen.findByRole('dialog', { name: /Add credential to prod-eu-1/ });
    expect(within(reopened).getByLabelText(/^Token/, { selector: 'input' })).toHaveValue('');
  });

  it('CRED-1: whitespace inside the token is a client error; nothing is sent', async () => {
    const writes = captureCredentialWrites();
    const { user } = renderApp('/admin/clusters/prod-eu-1/credentials');
    await findTable('prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Add credential' }));
    const dialog = await screen.findByRole('dialog', { name: /Add credential/ });
    await user.type(within(dialog).getByLabelText(/^Name/), 'fleet-ops');
    await user.click(within(dialog).getByLabelText(/^Token/, { selector: 'input' }));
    await user.paste('abc def');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('The token must not contain spaces or line breaks.')).toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('CRED-1: NameTaken lands on the name field; server field errors on their fields', async () => {
    const { user } = renderApp('/admin/clusters/prod-eu-1/credentials');
    await findTable('prod-eu-1');
    await user.click(screen.getByRole('button', { name: 'Add credential' }));
    const dialog = await screen.findByRole('dialog', { name: /Add credential/ });
    await user.type(within(dialog).getByLabelText(/^Name/), 'fleet-view');
    await user.click(within(dialog).getByLabelText(/^Token/, { selector: 'input' }));
    await user.paste(OPAQUE_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(
      await within(dialog).findByText('A credential named fleet-view already exists on prod-eu-1.'),
    ).toBeInTheDocument();

    server.use(
      http.post('/api/admin/clusters/{name}/credentials', () =>
        validationProblem({ token: ['The token may contain printable ASCII characters only.'] }),
      ),
    );
    await user.clear(within(dialog).getByLabelText(/^Name/));
    await user.type(within(dialog).getByLabelText(/^Name/), 'fleet-two');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(
      await within(dialog).findByText('The token may contain printable ASCII characters only.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Token/, { selector: 'input' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('Q10: adding an opaque token shows the warning toast', async () => {
    const { user, queryClient } = renderApp('/admin/clusters/lab-1/credentials');
    await screen.findByRole('heading', { name: 'No credentials' });
    await user.click(screen.getAllByRole('button', { name: 'Add credential' })[0] ?? document.body);
    const dialog = await screen.findByRole('dialog', { name: /Add credential to lab-1/ });
    await user.type(within(dialog).getByLabelText(/^Name/), 'bot');
    await user.click(within(dialog).getByLabelText(/^Token/, { selector: 'input' }));
    await user.paste(OPAQUE_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(await screen.findByText("Expiry unknown and it is tied to a person's account.")).toBeInTheDocument();
    expect(await screen.findByRole('grid', { name: 'Credentials of lab-1' })).toHaveTextContent('bot');
    expectTokenGone(OPAQUE_TOKEN, queryClient);
  });

  it('CRED-5/2: rotate shows fingerprint and affected users, sends version, forgets the token', async () => {
    const writes = captureCredentialWrites();
    const { user, queryClient } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findTable('prod-eu-1');
    const before = mockDb.credentials.find((c) => c.id === credentialIds.prodEuView);

    await rowAction(user, table, 'fleet-view', 'Rotate token');
    const dialog = await screen.findByRole('dialog', { name: /Rotate token of fleet-view on prod-eu-1/ });
    expect(dialog).toHaveAccessibleName(/prod$/);
    // The environment label follows the title text inside the heading (UX.md §9), not in the header's help slot.
    expect(within(within(dialog).getByRole('heading', { level: 1 })).getByText('prod')).toBeInTheDocument();
    expect(within(dialog).getByText(before?.fingerprint ?? '')).toBeInTheDocument();
    expect(within(dialog).getByText(/^2 users are affected\./)).toBeInTheDocument();

    await user.click(within(dialog).getByLabelText(/^New token/, { selector: 'input' }));
    await user.paste(JWT_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Rotate' }));

    expect(await screen.findByText('Token of fleet-view on prod-eu-1 rotated')).toBeInTheDocument();
    expect(writes).toEqual([{ body: { token: JWT_TOKEN, version: 1 }, csrf: '1' }]);
    await waitFor(() => expect(cellText(rowOf(table, 'fleet-view'), 'Rotated')).toMatch(/by admin$/));
    expectTokenGone(JWT_TOKEN, queryClient);
  });

  it('ADM-4: a stale version shows ConflictAlert and keeps the typed token', async () => {
    const { user } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findTable('prod-eu-1');
    await rowAction(user, table, 'fleet-edit', 'Rotate token');
    const dialog = await screen.findByRole('dialog', { name: /Rotate token of fleet-edit/ });
    // Another admin (or a connection test) changed the credential meanwhile.
    const record = mockDb.credentials.find((c) => c.id === credentialIds.prodEuEdit);
    if (record) record.version += 1;

    const input = within(dialog).getByLabelText(/^New token/, { selector: 'input' });
    await user.click(input);
    await user.paste(OPAQUE_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Rotate' }));

    expect(await within(dialog).findByRole('button', { name: 'Reload latest values' })).toBeInTheDocument();
    expect(input).toHaveValue(OPAQUE_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Reload latest values' }));
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: 'Reload latest values' })).not.toBeInTheDocument(),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Rotate' }));
    expect(await screen.findByText('Token of fleet-edit on prod-eu-1 rotated')).toBeInTheDocument();
  });

  it('CRED-6: an in-use credential lists its users and offers no delete', async () => {
    let deletes = 0;
    server.use(
      http.delete('/api/admin/clusters/{name}/credentials/{credentialId}', () => {
        deletes += 1;
        return undefined;
      }),
    );
    const { user } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findTable('prod-eu-1');
    await rowAction(user, table, 'fleet-view', 'Delete');

    const dialog = await screen.findByRole('dialog', { name: /fleet-view is in use on prod-eu-1/ });
    expect(within(dialog).getByText(/Re-assign or revoke these grants first\./)).toBeInTheDocument();
    const users = await within(dialog).findByRole('list', { name: 'Affected users' });
    const items = within(users).getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toHaveLength(2);
    expect(items.find((text) => text.startsWith('alice'))).toMatch(/Read only$/);
    expect(items.find((text) => text.startsWith('pending-paul'))).toMatch(/Read-write$/);
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(deletes).toBe(0);
  });

  it('CRED-6: an unused credential deletes after confirmation; a race shows the in-use view', async () => {
    const { user } = renderApp('/admin/clusters/prod-us-1/credentials');
    const table = await findTable('prod-us-1');

    await rowAction(user, table, 'legacy-token', 'Delete');
    let dialog = await screen.findByRole('dialog', { name: /^Delete credential\?/ });
    expect(dialog).toHaveTextContent('Are you sure you want to delete legacy-token from cluster prod-us-1?');
    server.use(
      http.delete('/api/admin/clusters/{name}/credentials/{credentialId}', () =>
        problem(409, { code: 'Credentials.InUse', detail: 'Credential legacy-token is used by 1 grants.' }),
      ),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: /legacy-token is in use on prod-us-1/ });
    expect(within(dialog).getByText('Credential legacy-token is used by 1 grants.')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    server.resetHandlers();
    await rowAction(user, table, 'legacy-token', 'Delete');
    dialog = await screen.findByRole('dialog', { name: /^Delete credential\?/ });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Credential legacy-token deleted from prod-us-1')).toBeInTheDocument();
    await waitFor(() => expect(within(table).queryByText('legacy-token')).not.toBeInTheDocument());
  });

  it('404: rotating a credential deleted meanwhile closes the dialog with a warning toast', async () => {
    const { user } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findTable('prod-eu-1');
    await rowAction(user, table, 'fleet-edit', 'Rotate token');
    const dialog = await screen.findByRole('dialog', { name: /Rotate token of fleet-edit on prod-eu-1/ });
    mockDb.credentials = mockDb.credentials.filter((c) => c.id !== credentialIds.prodEuEdit);

    await user.click(within(dialog).getByLabelText(/^New token/, { selector: 'input' }));
    await user.paste(OPAQUE_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Rotate' }));

    expect(await screen.findByText('Credential fleet-edit no longer exists on prod-eu-1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(within(table).queryByText('fleet-edit')).not.toBeInTheDocument());
  });

  it('404: deleting a credential deleted meanwhile closes the dialog with a warning toast', async () => {
    const { user } = renderApp('/admin/clusters/prod-us-1/credentials');
    const table = await findTable('prod-us-1');
    await rowAction(user, table, 'legacy-token', 'Delete');
    const dialog = await screen.findByRole('dialog', { name: /^Delete credential\?/ });
    mockDb.credentials = mockDb.credentials.filter((c) => c.id !== credentialIds.prodUsLegacy);

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Credential legacy-token no longer exists on prod-us-1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(within(table).queryByText('legacy-token')).not.toBeInTheDocument());
  });
});
