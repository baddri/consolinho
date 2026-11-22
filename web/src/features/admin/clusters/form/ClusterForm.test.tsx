import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { accessibleClustersQueryKey } from '@/features/cluster-context';
import { CSRF_HEADER } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { FAKE_CA_BUNDLE, http, mockDb, problem, setMockUser, validationProblem } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { adminRoute } from '../../routes';

/** A non-GET request: method, path, CSRF header and parsed JSON body. */
interface Command {
  method: string;
  path: string;
  csrf: string | null;
  body: unknown;
}

/** Records every non-GET request; await the returned function to read them with their bodies. */
function recordCommands(): () => Promise<Command[]> {
  const pending: Promise<Command>[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'GET') return;
    const clone = request.clone();
    pending.push(
      clone.text().then((text) => ({
        method: request.method,
        path: new URL(request.url).pathname,
        csrf: request.headers.get(CSRF_HEADER),
        body: text === '' ? undefined : (JSON.parse(text) as unknown),
      })),
    );
  });
  return () => Promise.all(pending);
}

/** Field lookup by its accessible name. */
const field = (name: string | RegExp) => screen.getByRole('textbox', { name });

/** Asserts the field's accessible description (its helper or error text) contains `message`. */
function expectDescription(element: HTMLElement, message: string) {
  expect(element).toHaveAccessibleDescription(expect.stringContaining(message));
}

/** Fills the required fields of the register form (non-production, so no confirmation). */
async function fillRequired(user: UserEvent, name = 'lab-2') {
  await user.click(field('Name'));
  await user.paste(name);
  await user.click(screen.getByRole('radio', { name: /^Staging/ }));
  await user.click(field('API URL'));
  await user.paste('https://api.lab-2.example.com:6443');
}

afterEach(() => server.events.removeAllListeners());

describe('Register cluster (CLU-1..3)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it(
    'CLU-1/2: sends the exact body with nulls for empty optionals and lands on the Credentials tab',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const commands = recordCommands();
      const { user, router, queryClient } = renderApp('/fleet/admin/clusters/new');
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      await screen.findByRole(
        'heading',
        { name: 'Register cluster', level: 1 },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      // OCP create pages have no breadcrumb.
      expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Enabled' })).toBeChecked();

      await fillRequired(user);
      await user.click(screen.getByRole('button', { name: 'Register' }));

      await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/clusters/lab-2/credentials'));
      expect(await screen.findByText('Cluster lab-2 registered')).toBeInTheDocument();
      expect(await commands()).toEqual([
        {
          method: 'POST',
          path: '/api/admin/clusters',
          csrf: '1',
          body: {
            name: 'lab-2',
            displayName: null,
            apiUrl: 'https://api.lab-2.example.com:6443',
            environment: 'staging',
            webConsoleUrl: null,
            description: null,
            caBundle: null,
            skipTlsVerify: false,
            isEnabled: true,
          },
        },
      ]);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: accessibleClustersQueryKey });
    },
  );

  it('CLU-1: shows inline client errors and sends nothing', async () => {
    const commands = recordCommands();
    const { user } = renderApp('/fleet/admin/clusters/new');
    await screen.findByRole('heading', { name: 'Register cluster', level: 1 });

    await user.click(field('Name'));
    await user.paste('Bad_Name');
    await user.click(field('API URL'));
    await user.paste('https://api.example.com/path');
    await user.click(field('Web console URL'));
    await user.paste('http://console.example.com');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expect(field('Name')).toHaveAttribute('aria-invalid', 'true'));
    expectDescription(
      field('Name'),
      "Use lowercase letters, digits and '-' (max 40), starting and ending with a letter or digit.",
    );
    expectDescription(
      field('API URL'),
      'API URL must contain only a host and an optional port (no path, query, fragment or user info).',
    );
    expectDescription(
      field('Web console URL'),
      'Web console URL must be an absolute https:// URL of at most 2048 characters.',
    );
    expect(screen.getByText('Choose production, staging or development.')).toBeInTheDocument();
    expect(await commands()).toEqual([]);
  });

  it('CLU-2: an invalid CA bundle from the server lands on the CA bundle field', async () => {
    const { user } = renderApp('/fleet/admin/clusters/new');
    await screen.findByRole('heading', { name: 'Register cluster', level: 1 });

    await fillRequired(user);
    expectDescription(field('CA bundle'), 'Leave empty to use the system trust store.');
    await user.click(field('CA bundle'));
    await user.paste('not a certificate');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() =>
      expectDescription(field('CA bundle'), 'The CA bundle must contain at least one PEM certificate.'),
    );
    expect(field('CA bundle')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('CLU-1: server 400 keys land on apiUrl and caBundle', async () => {
    server.use(
      http.post('/api/admin/clusters', () =>
        validationProblem({
          apiUrl: ['API URL must be an absolute https:// URL.'],
          caBundle: ['The CA bundle must not contain a private key.'],
        }),
      ),
    );
    const { user } = renderApp('/fleet/admin/clusters/new');
    await screen.findByRole('heading', { name: 'Register cluster', level: 1 });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expectDescription(field('API URL'), 'API URL must be an absolute https:// URL.'));
    expectDescription(field('CA bundle'), 'The CA bundle must not contain a private key.');
  });

  it('CLU-2: a CA bundle over 256 KiB is rejected client-side', async () => {
    const commands = recordCommands();
    const { user } = renderApp('/fleet/admin/clusters/new');
    await screen.findByRole('heading', { name: 'Register cluster', level: 1 });

    await fillRequired(user);
    await user.click(field('CA bundle'));
    await user.paste('x'.repeat(256 * 1024 + 1));
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expectDescription(field('CA bundle'), 'The CA bundle must be at most 256 KiB.'));
    expect(await commands()).toEqual([]);
  });

  it('CLU-1: 409 Clusters.NameTaken shows on the name', async () => {
    const { user } = renderApp('/fleet/admin/clusters/new');
    await screen.findByRole('heading', { name: 'Register cluster', level: 1 });

    await fillRequired(user, 'dev-1');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => expectDescription(field('Name'), 'Cluster dev-1 already exists.'));
  });

  it('CLU-3: Skip TLS warns, conflicts with a CA bundle and needs confirmation on production', async () => {
    const commands = recordCommands();
    const { user, router } = renderApp('/fleet/admin/clusters/new');
    await screen.findByRole('heading', { name: 'Register cluster', level: 1 });

    await fillRequired(user, 'prod-ap-1');
    await user.click(screen.getByRole('radio', { name: /^Production/ }));
    const skip = screen.getByRole('switch', { name: 'Skip TLS verification' });
    await user.click(skip);
    expect(
      screen.getByText(
        'TLS verification is disabled — Consolinho cannot detect a man-in-the-middle. Prefer a CA bundle.',
      ),
    ).toBeInTheDocument();

    await user.click(field('CA bundle'));
    await user.paste(FAKE_CA_BUNDLE);
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(
      await screen.findByText('Skip TLS verification and a CA bundle are mutually exclusive.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Register' }));
    let dialog = await screen.findByRole('dialog', { name: /Save without TLS verification/ });
    expect(dialog).toHaveTextContent('Save prod-ap-1 (production) without TLS verification?');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await commands()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Register' }));
    dialog = await screen.findByRole('dialog', { name: /Save without TLS verification/ });
    await user.click(within(dialog).getByRole('button', { name: 'Save without TLS verification' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/clusters/prod-ap-1/credentials'));
    const sent = await commands();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toMatchObject({ environment: 'production', skipTlsVerify: true, caBundle: null });
  });

  it('ADM-2: Register is aria-disabled with the reason for a read-only admin', async () => {
    setMockUser('ines');
    const commands = recordCommands();
    const { user } = renderApp('/fleet/admin/clusters/new');
    await screen.findByRole('heading', { name: 'Register cluster', level: 1 });

    const register = screen.getByRole('button', { name: 'Register' });
    await waitFor(() => expect(register).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(register);
    expect(await screen.findByText('Your account is read-only')).toBeInTheDocument();
    await fillRequired(user);
    await user.click(register);
    expect(await commands()).toEqual([]);
  });
});

describe('Edit cluster (CLU-4, ADM-4)', () => {
  beforeAll(() => preloadLazyRoutes([adminRoute]));

  it('CLU-4: hides name and enabled, sends the version and returns to the detail page', async () => {
    const commands = recordCommands();
    const { user, router, queryClient } = renderApp('/fleet/admin/clusters/dev-1/edit');
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await screen.findByRole('heading', { name: 'Edit dev-1', level: 1 });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Edit cluster')).toHaveAttribute('aria-current', 'page');
    const displayName = await screen.findByRole('textbox', { name: 'Display name' });

    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Enabled' })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Changing the API URL, CA bundle or Skip TLS marks existing connection test results as stale.',
      ),
    ).toBeInTheDocument();
    const cluster = mockDb.clusters.find((c) => c.name === 'dev-1');
    if (!cluster) throw new Error('fixture dev-1 missing');
    const loadedVersion = cluster.version;

    await user.clear(displayName);
    await user.paste('Development 1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/admin/clusters/dev-1'));
    expect(await screen.findByText('Cluster dev-1 updated')).toBeInTheDocument();
    const [put] = await commands();
    expect(put).toMatchObject({ method: 'PUT', path: '/api/admin/clusters/dev-1', csrf: '1' });
    expect(put?.body).toMatchObject({ displayName: 'Development 1', version: loadedVersion });
    expect(put?.body).not.toHaveProperty('name');
    expect(put?.body).not.toHaveProperty('isEnabled');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: accessibleClustersQueryKey });
  });

  it('ADM-4: a conflict keeps typed values; "Reload latest values" resets them', async () => {
    const { user } = renderApp('/fleet/admin/clusters/dev-1/edit');
    const displayName = await screen.findByRole('textbox', { name: 'Display name' });
    const cluster = mockDb.clusters.find((c) => c.name === 'dev-1');
    if (!cluster) throw new Error('fixture dev-1 missing');
    // Someone else edits the cluster after the form loaded.
    cluster.displayName = 'Changed elsewhere';
    cluster.version += 1;

    await user.clear(displayName);
    await user.paste('Mine');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('This cluster was changed by someone else. Reload and try again.'),
    ).toBeInTheDocument();
    expect(displayName).toHaveValue('Mine');

    await user.click(screen.getByRole('button', { name: 'Reload latest values' }));
    await waitFor(() => expect(displayName).toHaveValue('Changed elsewhere'));
    expect(screen.queryByText('Reload latest values')).not.toBeInTheDocument();
  });

  it('shows a not-found state for an unknown cluster', async () => {
    renderApp('/fleet/admin/clusters/nope/edit');

    expect(await screen.findByRole('heading', { name: 'Cluster nope not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Clusters' })).toHaveAttribute('href', '/fleet/admin/clusters');
  });

  it('shows an error state with retry when loading fails', async () => {
    server.use(
      http.get('/api/admin/clusters/{name}', () => problem(500, { detail: 'Database unavailable.' })),
    );
    renderApp('/fleet/admin/clusters/dev-1/edit');

    expect(await screen.findByText('Could not load cluster')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });
});
