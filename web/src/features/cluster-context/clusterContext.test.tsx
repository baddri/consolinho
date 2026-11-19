import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { credentialIds, mockDb, mockGuid, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { accessibleClustersQueryKey, useAccessibleClusters } from './index';

const LAST_CLUSTER_KEY = 'fleetconsole.lastCluster';

/** Opens the masthead cluster switcher and returns its options. */
async function openSwitcher(user: UserEvent, toggleName: string | RegExp) {
  await user.click(await screen.findByRole('button', { name: toggleName }));
  const list = await screen.findByRole('listbox', { name: 'Clusters' });
  return within(list).getAllByRole('option');
}

/** jsdom has no layout, so PatternFly starts with the sidebar closed; open it like a user would. */
async function openSidebar(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Global navigation' }));
  return screen.findByRole('navigation', { name: 'Global' });
}

/** Cluster name of each option (names contain a hyphen; environment labels such as "prod" do not). */
const optionNames = (options: HTMLElement[]) =>
  options.map((option) => within(option).getByText(/^[a-z0-9]+-[a-z0-9-]+$/).textContent);

describe('ClusterSwitcher (SW-1/SW-2)', () => {
  it('lists exactly the granted clusters in contract order with environment and read-only labels', async () => {
    setMockUser('alice');
    const { user } = renderApp('/c/prod-eu-1/overview');

    const toggle = await screen.findByRole('button', {
      name: 'Cluster prod-eu-1 (prod, read only), switch cluster',
    });
    expect(within(toggle).getByText('prod')).toBeInTheDocument();
    expect(within(toggle).getByText('Read only')).toBeInTheDocument();

    const options = await openSwitcher(user, 'Cluster prod-eu-1 (prod, read only), switch cluster');
    expect(optionNames(options)).toEqual(['prod-eu-1', 'staging-eu-1']);
    const [prod, staging] = options as [HTMLElement, HTMLElement];
    expect(within(prod).getByText('prod')).toBeInTheDocument();
    expect(within(prod).getByText('Read only')).toBeInTheDocument();
    expect(within(prod).getByText('Production EU 1')).toBeInTheDocument();
    expect(within(staging).getByText('staging')).toBeInTheDocument();
    expect(within(staging).queryByText('Read only')).not.toBeInTheDocument();
  });

  it('marks every cluster read-only for a globally read-only user (effective access mode)', async () => {
    setMockUser('ines');
    // Give ines a ReadWrite grant as well: the effective mode must still be read-only.
    mockDb.grants.push({
      id: mockGuid(0x2ff),
      username: 'ines',
      clusterName: 'dev-1',
      credentialId: credentialIds.dev1Edit,
      accessMode: 'readWrite',
      grantedAt: '2026-11-01T00:00:00Z',
      grantedBy: 'admin',
      updatedAt: null,
      updatedBy: null,
      version: 1,
    });
    const { user } = renderApp('/c/dev-1/overview');

    const options = await openSwitcher(user, 'Cluster dev-1 (dev, read only), switch cluster');
    expect(optionNames(options)).toEqual(['prod-us-1', 'dev-1']);
    for (const option of options) {
      expect(within(option).getByText('Read only')).toBeInTheDocument();
    }
  });

  it('shows a skeleton in a disabled toggle while loading', async () => {
    server.use(
      http.get('*/api/clusters', async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderApp('/admin/users');

    expect(await screen.findByRole('button', { name: 'Loading clusters' })).toBeDisabled();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    server.use(
      http.get('*/api/clusters', () => HttpResponse.json({ title: 'Down' }, { status: 503 }), {
        once: true,
      }),
    );
    const { user } = renderApp('/admin/users');

    await user.click(await screen.findByRole('button', { name: 'Clusters unavailable — retry' }));

    const options = await openSwitcher(user, 'Select a cluster');
    expect(optionNames(options)).toEqual(['dev-1']);
  });

  it('shows a disabled "No clusters" toggle to a user without grants', async () => {
    setMockUser('bob');
    renderApp('/');

    expect(await screen.findByRole('button', { name: 'No clusters' })).toBeDisabled();
  });
});

describe('landing on / (SW-3/SW-4)', () => {
  it('goes to the remembered cluster when it is still granted', async () => {
    setMockUser('alice');
    localStorage.setItem(LAST_CLUSTER_KEY, 'staging-eu-1');
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/staging-eu-1/overview');
  });

  it('ignores a stale remembered cluster and goes to the first one', async () => {
    setMockUser('alice');
    localStorage.setItem(LAST_CLUSTER_KEY, 'dev-1');
    const { router } = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/prod-eu-1/overview');
  });

  it('remembers the granted cluster being viewed', async () => {
    setMockUser('alice');
    renderApp('/c/staging-eu-1/search');

    expect(await screen.findByRole('heading', { name: 'Search', level: 1 })).toBeInTheDocument();
    expect(localStorage.getItem(LAST_CLUSTER_KEY)).toBe('staging-eu-1');
  });

  it('tells a user without grants who they are, without admin links', async () => {
    setMockUser('bob');
    const { router } = renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'No clusters assigned yet', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.textContent ===
          'You are logged in as bob, but no clusters have been assigned to you. Ask a FleetConsole administrator ' +
            'to grant you access.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to Administration' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('also points an admin without grants to Administration and their own access tab (GRANT-6)', async () => {
    server.use(http.get('*/api/clusters', () => HttpResponse.json([])));
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'No clusters assigned yet' })).toBeInTheDocument();
    expect(screen.getByText(/You are logged in as/)).toHaveTextContent('You are logged in as admin,');
    expect(screen.getByRole('link', { name: 'Go to Administration' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByText(/Admins need a grant too/)).toHaveTextContent(
      'Admins need a grant too: grant yourself access from your user page.',
    );
    expect(screen.getByRole('link', { name: 'grant yourself access from your user page' })).toHaveAttribute(
      'href',
      '/admin/users/admin/access',
    );
  });

  it('tells a read-only admin without grants to ask another administrator (ADM-2)', async () => {
    setMockUser('ines');
    server.use(http.get('*/api/clusters', () => HttpResponse.json([])));
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'No clusters assigned yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Administration' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(
      screen.getByText('Admins need a grant too: ask another administrator to grant you access.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /grant yourself access/ })).not.toBeInTheDocument();
  });

  it('shows an error with Retry when the list cannot be loaded', async () => {
    server.use(
      http.get(
        '*/api/clusters',
        () => HttpResponse.json({ title: 'Down', detail: 'Try later.' }, { status: 503 }),
        {
          once: true,
        },
      ),
    );
    const { user, router } = renderApp('/');

    expect(await screen.findByText('Could not load your clusters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/dev-1/overview');
  });
});

describe('ClusterGate (SW-5)', () => {
  it.each([
    ['an unknown cluster', 'does-not-exist'],
    ['an ungranted cluster', 'dev-1'],
    ['a granted but disabled cluster', 'dev-2'],
  ])('renders the same "not available" page for %s', async (_case, cluster) => {
    setMockUser('alice');
    renderApp(`/c/${cluster}/overview`);

    expect(
      await screen.findByRole('heading', { name: `Cluster ${cluster} is not available`, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("It does not exist or you don't have access.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
    expect(localStorage.getItem(LAST_CLUSTER_KEY)).toBeNull();
  });
});

describe('sidebar cluster links', () => {
  it('target the remembered cluster on non-cluster pages', async () => {
    setMockUser('carol');
    // carol: prod-eu-1 granted (dev-2 is disabled); stale names fall back to it.
    localStorage.setItem(LAST_CLUSTER_KEY, 'dev-2');
    const { user } = renderApp('/admin/users');

    const nav = await openSidebar(user);
    expect(await within(nav).findByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/c/prod-eu-1/overview',
    );
  });

  it('target a granted cluster on the "not available" page', async () => {
    setMockUser('alice');
    localStorage.setItem(LAST_CLUSTER_KEY, 'staging-eu-1');
    const { user } = renderApp('/c/nope/overview');

    await screen.findByRole('heading', { name: 'Cluster nope is not available' });
    const nav = await openSidebar(user);
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/c/staging-eu-1/overview',
    );
  });

  it('are hidden for a user without clusters', async () => {
    setMockUser('bob');
    const { user } = renderApp('/');

    await screen.findByRole('heading', { name: 'No clusters assigned yet' });
    const nav = await openSidebar(user);
    expect(within(nav).queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
  });
});

/** Mounts the hook so its query is registered in the cache. */
function ClustersProbe() {
  const { data } = useAccessibleClusters();
  return <p>{data ? `${data.length} clusters` : 'loading'}</p>;
}

describe('useAccessibleClusters (SW-6)', () => {
  it('refetches on window focus and every 5 minutes', async () => {
    const { queryClient } = renderWithProviders(<ClustersProbe />);

    expect(await screen.findByText('1 clusters')).toBeInTheDocument();
    const query = queryClient.getQueryCache().find({ queryKey: accessibleClustersQueryKey, exact: true });
    expect(accessibleClustersQueryKey).toEqual(['api', 'clusters']);
    expect(query?.options).toMatchObject({
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchInterval: 300_000,
    });
  });
});
