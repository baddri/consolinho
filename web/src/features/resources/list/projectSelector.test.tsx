import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb, mockK8s } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';
import { resourceRoutes } from '../routes';

const LAST_NAMESPACE_KEY = 'fleetconsole.lastNamespace';
const SHOW_DEFAULTS_KEY = 'fleetconsole.showDefaultProjects';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  mockViewportWidth(1440);
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** Gives the admin a grant on the vanilla Kubernetes cluster `lab-1` (no fixture grant). */
function grantLab1(): void {
  mockDb.credentials.push({
    ...structuredClone(mockDb.credentials[0]),
    id: 'lab',
    name: 'fleet-admin',
    clusterName: 'lab-1',
  } as (typeof mockDb.credentials)[number]);
  mockDb.grants.push({
    ...structuredClone(mockDb.grants[0]),
    id: 'lab',
    username: 'admin',
    clusterName: 'lab-1',
    credentialId: 'lab',
  } as (typeof mockDb.grants)[number]);
}

/** Answers the projects list (not its watch) with a Kubernetes 403. */
function forbidProjects(): void {
  server.use(
    http.get('*/api/clusters/:cluster/k8s/apis/project.openshift.io/v1/projects', ({ request }) =>
      new URL(request.url).searchParams.has('watch')
        ? undefined
        : HttpResponse.json(
            {
              kind: 'Status',
              apiVersion: 'v1',
              status: 'Failure',
              reason: 'Forbidden',
              code: 403,
              message: 'no',
            },
            { status: 403 },
          ),
    ),
  );
}

/** Opens the selector and returns its list box once the items have loaded. */
async function openSelector(user: UserEvent, toggle: string, listName = 'Projects'): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: toggle }, { timeout: COLD_START_TIMEOUT_MS }));
  const list = await screen.findByRole('listbox', { name: listName });
  await waitFor(() => expect(within(list).queryByText(/^Loading/)).not.toBeInTheDocument());
  return list;
}

const optionNames = (list: HTMLElement) =>
  within(list)
    .getAllByRole('option')
    .map((option) => option.textContent);

const remembered = (): unknown => JSON.parse(localStorage.getItem(LAST_NAMESPACE_KEY) ?? '{}');

describe('project selector (NS-1..4)', () => {
  it(
    'lists the projects of dev-1 without default projects and filters by search (NS-1, NS-4)',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp('/c/dev-1/k8s/all-namespaces/pods');

      const list = await openSelector(user, 'Project: All projects');
      expect(optionNames(list)).toEqual(['All projects', 'paymentsPayments', 'shopWeb shop']);

      await user.paste('pay');
      expect(optionNames(list)).toEqual(['paymentsPayments']);

      await user.clear(screen.getByRole('textbox', { name: 'Search projects' }));
      await user.paste('zzz');
      expect(within(list).getByRole('option', { name: 'No projects match "zzz"' })).toBeDisabled();
      expect(screen.getByRole('status')).toHaveTextContent('No projects match "zzz"');
    },
  );

  it('shows default projects once the toggle is on and remembers the toggle (NS-4)', async () => {
    const { user } = renderApp('/c/dev-1/k8s/all-namespaces/pods');

    const list = await openSelector(user, 'Project: All projects');
    await user.click(screen.getByRole('switch', { name: 'Show default projects' }));

    for (const shown of ['default', 'kube-system', 'openshift-monitoring']) {
      expect(await within(list).findByRole('option', { name: shown })).toBeInTheDocument();
    }
    expect(localStorage.getItem(SHOW_DEFAULTS_KEY)).toBe('true');
  });

  it('always shows the selected project, even a default one (NS-4)', async () => {
    const { user } = renderApp('/c/dev-1/k8s/ns/kube-system/pods');

    const list = await openSelector(user, 'Project: kube-system');
    expect(within(list).getByRole('option', { name: 'kube-system' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(list).queryByRole('option', { name: 'default' })).not.toBeInTheDocument();
  });

  it('navigates to the chosen project keeping the query, and remembers it per cluster (NS-2)', async () => {
    grantLab1();
    const { user, router } = renderApp('/c/dev-1/k8s/all-namespaces/pods?name=web');
    await screen.findAllByRole('link', { name: /^web-/ }, { timeout: COLD_START_TIMEOUT_MS });

    const list = await openSelector(user, 'Project: All projects');
    await user.click(within(list).getByRole('option', { name: /^shop/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/shop/pods'));
    expect(router.state.location.search).toBe('?name=web');
    await waitFor(() => expect(remembered()).toEqual({ 'dev-1': 'shop' }));
    expect(await screen.findByRole('grid', { name: 'Pods' })).toBeInTheDocument();
    await screen.findAllByRole('link', { name: /^web-/ });

    // Sidebar links target the redirect path `k8s/<plural>`.
    await router.navigate('/c/dev-1/k8s/configmaps');
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/shop/configmaps'));
    expect(await screen.findByRole('link', { name: 'web-config' })).toBeInTheDocument();

    await router.navigate('/c/lab-1/k8s/configmaps');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/c/lab-1/k8s/all-namespaces/configmaps'),
    );
    await waitFor(() => expect(remembered()).toEqual({ 'dev-1': 'shop', 'lab-1': '#all' }));
    expect(await screen.findByRole('link', { name: 'web-config' })).toBeInTheDocument();
  });

  it('lists namespaces on vanilla Kubernetes (NS-1)', async () => {
    grantLab1();
    const { user } = renderApp('/c/lab-1/k8s/all-namespaces/pods');

    const list = await openSelector(user, 'Namespace: All namespaces', 'Namespaces');
    expect(optionNames(list)).toEqual(['All namespaces', 'payments', 'shop']);
  });

  it('shows a project created while the menu is open (live)', async () => {
    const { user } = renderApp('/c/dev-1/k8s/all-namespaces/pods');

    const list = await openSelector(user, 'Project: All projects');
    mockK8s.upsert('dev-1', {
      apiVersion: 'project.openshift.io/v1',
      kind: 'Project',
      metadata: { name: 'checkout' },
    });

    expect(await within(list).findByRole('option', { name: 'checkout' })).toBeInTheDocument();
  });

  it('falls back to a typed project name when projects cannot be listed (NS-3)', async () => {
    forbidProjects();
    const { user, router } = renderApp('/c/dev-1/k8s/all-namespaces/pods');

    await user.click(await screen.findByRole('button', { name: 'Project: All projects' }));
    expect(
      await screen.findByText("You can't list projects on dev-1; enter a project name."),
    ).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Project name' });
    await user.type(input, 'Bad_Name{Enter}');
    expect(screen.getByText(/Use lowercase letters, digits and '-'/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/dev-1/k8s/all-namespaces/pods');

    await user.clear(input);
    await user.type(input, 'shop{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/shop/pods'));
  });
});
