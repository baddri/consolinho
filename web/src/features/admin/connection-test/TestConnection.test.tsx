import { screen, waitFor, within } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import { delay } from 'msw';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { credentialIds, http, setMockUser, validationProblem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { adminRoute } from '../routes';
import { withoutBadges } from '../dataViewTestUtils';

/** Fake tokens only: the mock backend fails `bad-…` at authentication and passes anything else. */
const FAILING_TOKEN = 'bad-fake-token-for-tests';
const PASSING_TOKEN = 'fake-good-token-for-tests';

type User = ReturnType<typeof renderApp>['user'];

/** Records body and CSRF header of every connection-test request, then lets the mock backend answer. */
function captureTests() {
  const requests: { path: string; body: unknown; csrf: string | null }[] = [];
  const record = async (request: Request) => {
    requests.push({
      path: new URL(request.url).pathname,
      body: await request.clone().json(),
      csrf: request.headers.get('X-Console-Request'),
    });
    return undefined;
  };
  server.use(
    http.post('/api/admin/clusters/{name}/credentials/{credentialId}/test', ({ request }) => record(request)),
    http.post('/api/admin/clusters/{name}/test-token', ({ request }) => record(request)),
  );
  return requests;
}

/** Makes `path` hang until aborted; returns the signal of every request it received (to assert cancellation). */
function holdRequests(
  path: '/api/admin/clusters/{name}/credentials/{credentialId}/test' | '/api/admin/clusters/{name}/test-token',
) {
  const signals: AbortSignal[] = [];
  server.use(
    http.post(path, async ({ request }) => {
      signals.push(request.signal);
      await delay('infinite');
      return undefined;
    }),
  );
  return signals;
}

/** The body row of the credentials table whose first cell starts with `name`. */
function credentialRow(table: HTMLElement, name: string): HTMLElement {
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => withoutBadges(within(candidate).queryAllByRole('cell')[0]).startsWith(name));
  if (!row) throw new Error(`No row ${name}`);
  return row;
}

/** Opens the credentials tab of `cluster` and returns its table once rows are there. */
async function findCredentials(cluster: string, timeout?: number) {
  const table = await screen.findByRole('grid', { name: `Credentials of ${cluster}` }, { timeout });
  await within(table).findAllByRole('button', { name: 'Kebab toggle' }, { timeout });
  return table;
}

/** Opens the kebab of credential `name` and clicks `action`. */
async function credentialAction(user: User, table: HTMLElement, name: string, action: string) {
  await user.click(within(credentialRow(table, name)).getByRole('button', { name: 'Kebab toggle' }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

/** Asserts `token` is nowhere: not rendered, not in the query or mutation caches. */
function expectTokenGone(token: string, queryClient: QueryClient) {
  expect(document.body.textContent).not.toContain(token);
  const queries = queryClient.getQueryCache().getAll();
  expect(JSON.stringify(queries.map((query) => [query.queryKey, query.state.data]))).not.toContain(token);
  const mutations = queryClient.getMutationCache().getAll();
  expect(JSON.stringify(mutations.map((mutation) => mutation.state.variables ?? null))).not.toContain(token);
}

beforeEach(() => mockViewportWidth(1440));

describe('Connection test (T-0038)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'TEST-1/4: cluster Actions → pick a credential → result with hints, toast and CSRF header',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const requests = captureTests();
      const { user } = renderApp('/admin/clusters/prod-eu-1');
      await user.click(await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }));
      await user.click(await screen.findByRole('menuitem', { name: 'Test connection' }));
      const dialog = await screen.findByRole('dialog', { name: /Test connection to prod-eu-1/ });

      // Two credentials: nothing pre-selected, so running without a choice is a client error.
      const picker = await within(dialog).findByRole('combobox', { name: /Credential/ });
      expect(picker).toHaveValue('');
      await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
      expect(await within(dialog).findByText('Select a credential.')).toBeInTheDocument();
      expect(requests).toHaveLength(0);

      await user.selectOptions(picker, 'fleet-view');
      await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
      expect(await within(dialog).findByText(/^Connection test passed in/)).toBeInTheDocument();
      expect(
        within(dialog).getByText('1 users have ReadWrite grants with this credential but it cannot modify workloads'),
      ).toBeInTheDocument();
      expect(await screen.findByText('Connection test passed for fleet-view on prod-eu-1')).toBeInTheDocument();
      expect(requests).toEqual([
        {
          path: `/api/admin/clusters/prod-eu-1/credentials/${credentialIds.prodEuView}/test`,
          body: { inspectNamespace: null },
          csrf: '1',
        },
      ]);
    },
  );

  it('TEST-1/5: disabled dev-2 — credential kebab "Test" pre-selects it, notes the disabled cluster (T-0052) and the Last test cell updates', async () => {
    const { user } = renderApp('/admin/clusters/dev-2/credentials');
    const table = await findCredentials('dev-2');
    expect(within(credentialRow(table, 'fleet-view')).getByText('Never tested')).toBeInTheDocument();

    await credentialAction(user, table, 'fleet-view', 'Test');
    const dialog = await screen.findByRole('dialog', { name: /Test connection to dev-2/ });
    expect(await within(dialog).findByRole('combobox', { name: /Credential/ })).toHaveValue(credentialIds.dev2View);
    expect(within(dialog).getByText(/dev-2 is disabled\. Connection tests still run/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(await within(dialog).findByText(/^Connection test passed in/)).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1) ?? dialog);

    await waitFor(() =>
      expect(within(credentialRow(table, 'fleet-view')).getByText('Passed · Cluster-wide view')).toBeInTheDocument(),
    );
  });

  it('TEST-1: the disabled-cluster note and a failing stored test (TLS) from the list kebab', async () => {
    const { user } = renderApp('/admin/clusters');
    const link = await screen.findByRole('link', { name: 'dev-2' });
    const row = link.closest('tr');
    if (!row) throw new Error('no dev-2 row');
    await user.click(within(row).getByRole('button', { name: 'Kebab toggle' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Test connection' }));
    const dialog = await screen.findByRole('dialog', { name: /Test connection to dev-2/ });
    expect(await within(dialog).findByText(/dev-2 is disabled\. Connection tests still run/)).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1) ?? dialog);

    const dev1 = screen.getByRole('link', { name: 'dev-1' }).closest('tr');
    if (!dev1) throw new Error('no dev-1 row');
    await user.click(within(dev1).getByRole('button', { name: 'Kebab toggle' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Test connection' }));
    const dev1Dialog = await screen.findByRole('dialog', { name: /Test connection to dev-1/ });
    await within(dev1Dialog).findByRole('combobox', { name: /Credential/ });
    await user.click(within(dev1Dialog).getByRole('button', { name: 'Run test' }));
    const steps = await within(dev1Dialog).findByRole('list', { name: 'Test steps' });
    expect(within(steps).getAllByRole('listitem')[0]).toHaveTextContent(
      'Reachability: Certificate signed by unknown authority — add the cluster CA bundle',
    );
    expect(await screen.findByText('Connection test failed for fleet-edit on dev-1')).toBeInTheDocument();
  });

  it('TEST-1: a cluster without credentials has the action aria-disabled with the reason', async () => {
    const { user } = renderApp('/admin/clusters');
    const row = (await screen.findByRole('link', { name: 'lab-1' })).closest('tr');
    if (!row) throw new Error('no lab-1 row');
    await user.click(within(row).getByRole('button', { name: 'Kebab toggle' }));
    const item = await screen.findByRole('menuitem', { name: 'Test connection' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Add a credential first');
  });

  it('TEST-3: inspect namespace — invalid input is a field error; the server error lands on the field too', async () => {
    const { user } = renderApp('/admin/clusters/dev-2/credentials');
    const table = await findCredentials('dev-2');
    await credentialAction(user, table, 'fleet-view', 'Test');
    const dialog = await screen.findByRole('dialog', { name: /Test connection to dev-2/ });
    const namespace = await within(dialog).findByRole('textbox', { name: 'Inspect namespace' });

    await user.type(namespace, 'Bad_NS');
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(await within(dialog).findByText(/Use lowercase letters, digits and '-' \(max 63\)/)).toBeInTheDocument();

    server.use(
      http.post('/api/admin/clusters/{name}/credentials/{credentialId}/test', () =>
        validationProblem({ inspectNamespace: ['Namespace does not exist.'] }),
      ),
    );
    await user.clear(namespace);
    await user.type(namespace, 'payments');
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(await within(dialog).findByText('Namespace does not exist.')).toBeInTheDocument();
    expect(namespace).toHaveAttribute('aria-invalid', 'true');
  });

  it('TEST-3: inspecting a namespace shows its rules', async () => {
    const { user } = renderApp('/admin/clusters/dev-2/credentials');
    const table = await findCredentials('dev-2');
    await credentialAction(user, table, 'fleet-view', 'Test');
    const dialog = await screen.findByRole('dialog', { name: /Test connection to dev-2/ });
    await user.type(await within(dialog).findByRole('textbox', { name: 'Inspect namespace' }), 'shop');
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Rules in namespace shop' }));
    expect(within(dialog).getByRole('grid', { name: 'Rules in namespace shop' })).toBeInTheDocument();
  });

  it('TEST-1: "Cancel test" aborts a slow test, announces it, and nothing is shown or retried', async () => {
    const signals = holdRequests('/api/admin/clusters/{name}/credentials/{credentialId}/test');
    const { user } = renderApp('/admin/clusters/dev-2/credentials');
    const table = await findCredentials('dev-2');
    await credentialAction(user, table, 'fleet-view', 'Test');
    const dialog = await screen.findByRole('dialog', { name: /Test connection to dev-2/ });
    await within(dialog).findByRole('combobox', { name: /Credential/ });
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    const progress = await within(dialog).findByText('Testing… this can take up to 15 seconds.');
    expect(progress.closest('[aria-live="polite"]')).not.toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel test' }));
    await waitFor(() => expect(signals[0]?.aborted).toBe(true));
    expect(await within(dialog).findByText('Test cancelled.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Testing…/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/^Connection test/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(signals).toHaveLength(1);
  });

  it('CRED-5: the rotate dialog\'s "Cancel test" aborts test-token and keeps the typed token', async () => {
    const signals = holdRequests('/api/admin/clusters/{name}/test-token');
    const { user, queryClient } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findCredentials('prod-eu-1');
    await credentialAction(user, table, 'fleet-edit', 'Rotate token');
    const dialog = await screen.findByRole('dialog', { name: /Rotate token of fleet-edit on prod-eu-1/ });
    const token = within(dialog).getByLabelText(/^New token/, { selector: 'input' });
    await user.click(token);
    await user.paste(PASSING_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Test new token' }));
    expect(await within(dialog).findByText('Testing… this can take up to 15 seconds.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel test' }));
    await waitFor(() => expect(signals[0]?.aborted).toBe(true));
    expect(await within(dialog).findByText('Test cancelled.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Rotate' })).not.toHaveAttribute('aria-disabled', 'true');
    expect(token).toHaveValue(PASSING_TOKEN);
    expectTokenGone(PASSING_TOKEN, queryClient);
    expect(signals).toHaveLength(1);
  });

  it('ADM-2: test actions are aria-disabled for a read-only admin', async () => {
    setMockUser('ines');
    const { user } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findCredentials('prod-eu-1');
    await user.click(within(credentialRow(table, 'fleet-view')).getByRole('button', { name: 'Kebab toggle' }));
    expect(await screen.findByRole('menuitem', { name: 'Test' })).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Test connection' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('CRED-5/2: "Test new token" posts test-token; a failure turns Rotate into "Save anyway"; edits reset it', async () => {
    const requests = captureTests();
    const { user, queryClient } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findCredentials('prod-eu-1');
    await credentialAction(user, table, 'fleet-edit', 'Rotate token');
    const dialog = await screen.findByRole('dialog', { name: /Rotate token of fleet-edit on prod-eu-1/ });
    const token = within(dialog).getByLabelText(/^New token/, { selector: 'input' });

    await user.click(token);
    await user.paste(FAILING_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Test new token' }));
    expect(
      await within(dialog).findByText(
        'Authentication: Token rejected by the cluster (expired, revoked, or for another cluster)',
      ),
    ).toBeInTheDocument();
    expect(requests).toEqual([
      {
        path: '/api/admin/clusters/prod-eu-1/test-token',
        body: { token: FAILING_TOKEN, credentialId: credentialIds.prodEuEdit, inspectNamespace: null },
        csrf: '1',
      },
    ]);
    expect(within(dialog).queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save anyway' })).toBeInTheDocument();
    // The result is kept, the token is not: nothing but the input holds it.
    expectTokenGone(FAILING_TOKEN, queryClient);
    expect(within(dialog).getByDisplayValue(FAILING_TOKEN)).toBe(token);

    // Editing the token forgets the result.
    await user.clear(token);
    await user.paste(PASSING_TOKEN);
    expect(within(dialog).queryByText(/^Connection test failed/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Rotate' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Test new token' }));
    expect(await within(dialog).findByRole('button', { name: 'Show full result' })).toBeInTheDocument();
    expect(within(dialog).getAllByText(/^Connection test passed in/)[0]).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Rotate' })).toBeInTheDocument();
    expectTokenGone(PASSING_TOKEN, queryClient);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue(PASSING_TOKEN)).not.toBeInTheDocument();
  });

  it('CRED-5: "Save anyway" rotates the token whose test failed', async () => {
    const { user } = renderApp('/admin/clusters/prod-eu-1/credentials');
    const table = await findCredentials('prod-eu-1');
    await credentialAction(user, table, 'fleet-view', 'Rotate token');
    const dialog = await screen.findByRole('dialog', { name: /Rotate token of fleet-view on prod-eu-1/ });
    await user.click(within(dialog).getByLabelText(/^New token/, { selector: 'input' }));
    await user.paste(FAILING_TOKEN);
    await user.click(within(dialog).getByRole('button', { name: 'Test new token' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Save anyway' }));
    expect(await screen.findByText('Token of fleet-view on prod-eu-1 rotated')).toBeInTheDocument();
  });
});
