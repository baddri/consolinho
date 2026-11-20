import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { AccessibleCluster } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS } from '@/test/coldStart';
import { credentialIds, mockDb, mockGuid, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { accessibleClustersQueryKey, useAccessibleClusters } from './index';

const LAST_CLUSTER_KEY = 'fleetconsole.lastCluster';
const recentKey = (username: string) => `fleetconsole.recentClusters.${username}`;

/** Grants the current user every fixture cluster (incl. the disabled dev-2), read-write, in fixture order. */
function grantAllClusters() {
  const all: AccessibleCluster[] = mockDb.clusters.map(({ name, displayName, environment }) => ({
    name,
    displayName,
    environment,
    accessMode: 'readWrite',
    webConsoleUrl: null,
  }));
  server.use(http.get('*/api/clusters', () => HttpResponse.json(all)));
}

/** Opens the masthead cluster switcher and returns its options. */
async function openSwitcher(user: UserEvent, toggleName: string | RegExp, timeout?: number) {
  await user.click(await screen.findByRole('button', { name: toggleName }, { timeout }));
  const list = await screen.findByRole('listbox', { name: 'All clusters' });
  return within(list).getAllByRole('option');
}

/** The option showing cluster `name`; fails the test when it is missing. */
function optionOf(options: HTMLElement[], name: string): HTMLElement {
  const option = options.find((candidate) => within(candidate).queryByText(name));
  if (!option) throw new Error(`No option for cluster ${name}`);
  return option;
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
  // First full-app render of the file: its first wait gets the documented cold-start allowance (T-0046).
  it(
    'lists exactly the granted clusters in contract order with environment and read-only labels',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      setMockUser('alice');
      const { user } = renderApp('/c/prod-eu-1/overview');

      const toggle = await screen.findByRole(
        'button',
        { name: 'Cluster prod-eu-1 (prod, read only), switch cluster' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
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
    },
  );

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

describe('ClusterSwitcher search (SW-7)', () => {
  it('focuses the search box on open and filters by name, display name and environment', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');

    await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    const search = screen.getByRole('textbox', { name: 'Search clusters' });
    await waitFor(() => expect(search).toHaveFocus());

    await user.paste('us');
    const list = screen.getByRole('listbox', { name: 'All clusters' });
    expect(optionNames(within(list).getAllByRole('option'))).toEqual(['prod-us-1']);

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    await user.paste('STAGING');
    // Re-query: the list moves out of the "All clusters" group when the Recent group disappears.
    const filtered = screen.getByRole('listbox', { name: 'All clusters' });
    expect(optionNames(within(filtered).getAllByRole('option'))).toEqual(['staging-eu-1']);
  });

  it('opens the first match on Enter', async () => {
    grantAllClusters();
    const { user, router } = renderApp('/c/dev-1/overview');

    await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    await user.paste('prod');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/prod-eu-1/overview'));
    expect(screen.queryByRole('listbox', { name: 'All clusters' })).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');

    await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    await user.paste('zzz');

    const list = screen.getByRole('listbox', { name: 'All clusters' });
    expect(within(list).getByRole('option', { name: 'No clusters match "zzz"' })).toBeDisabled();
  });

  it('marks the active cluster as selected', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/staging-eu-1/overview');

    const options = await openSwitcher(user, 'Cluster staging-eu-1 (staging), switch cluster');
    const selected = options.filter((option) => option.getAttribute('aria-selected') === 'true');
    expect(optionNames(selected)).toEqual(['staging-eu-1']);
  });
});

describe('ClusterSwitcher recent clusters (SW-8)', () => {
  it('lists the visited clusters newest first, per user, and hides the group while searching', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');

    const options = await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    await user.click(optionOf(options, 'prod-eu-1'));
    await user.click(await screen.findByRole('button', { name: 'Cluster prod-eu-1 (prod), switch cluster' }));

    const recent = await screen.findByRole('listbox', { name: 'Recent clusters' });
    expect(optionNames(within(recent).getAllByRole('option'))).toEqual(['prod-eu-1', 'dev-1']);
    expect(screen.getByRole('heading', { name: 'Recent' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(recentKey('admin')) ?? '[]')).toEqual(['prod-eu-1', 'dev-1']);

    await user.paste('dev');
    expect(screen.queryByRole('listbox', { name: 'Recent clusters' })).not.toBeInTheDocument();
  });

  it('keeps at most five, de-duplicated', async () => {
    grantAllClusters();
    localStorage.setItem(
      recentKey('admin'),
      JSON.stringify(['prod-eu-1', 'prod-us-1', 'staging-eu-1', 'dev-2', 'lab-1']),
    );
    renderApp('/c/dev-1/overview');

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(recentKey('admin')) ?? '[]')).toEqual([
        'dev-1',
        'prod-eu-1',
        'prod-us-1',
        'staging-eu-1',
        'dev-2',
      ]),
    );
  });

  it('hides recent clusters that are no longer granted', async () => {
    setMockUser('alice');
    localStorage.setItem(recentKey('alice'), JSON.stringify(['dev-1', 'staging-eu-1']));
    const { user } = renderApp('/admin/users');

    await openSwitcher(user, 'Select a cluster');
    const recent = screen.getByRole('listbox', { name: 'Recent clusters' });
    expect(optionNames(within(recent).getAllByRole('option'))).toEqual(['staging-eu-1']);
  });

  it('has no Recent group for a fresh user', async () => {
    localStorage.setItem(recentKey('alice'), JSON.stringify(['dev-1']));
    const { user } = renderApp('/admin/users');

    await openSwitcher(user, 'Select a cluster');
    expect(screen.queryByRole('listbox', { name: 'Recent clusters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument();
  });
});

describe('ClusterSwitcher keeps context (SW-9)', () => {
  it('keeps the path and filters when switching between clusters', async () => {
    grantAllClusters();
    const { user, router } = renderApp('/c/dev-1/ns/shop/pods?label=app%3Dweb');

    const options = await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    await user.click(optionOf(options, 'dev-2'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-2/ns/shop/pods'));
    expect(router.state.location.search).toBe('?label=app%3Dweb');
    expect(screen.getByRole('button', { name: 'Cluster dev-2 (dev), switch cluster' })).toHaveFocus();
  });

  it('goes to the cluster root from a non-cluster page', async () => {
    grantAllClusters();
    const { user, router } = renderApp('/admin/users');

    const options = await openSwitcher(user, 'Select a cluster');
    await user.click(optionOf(options, 'dev-2'));

    // `/c/dev-2` — the cluster's index route then picks its landing page.
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-2/overview'));
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
          'You are logged in as bob, but no clusters have been assigned to you. Ask a Consolinho administrator ' +
            'to grant you access.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to Fleet administration' })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('also points an admin without grants to Fleet administration and their own access tab (GRANT-6)', async () => {
    server.use(http.get('*/api/clusters', () => HttpResponse.json([])));
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'No clusters assigned yet' })).toBeInTheDocument();
    expect(screen.getByText(/You are logged in as/)).toHaveTextContent('You are logged in as admin,');
    expect(screen.getByRole('link', { name: 'Go to Fleet administration' })).toHaveAttribute(
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
    expect(screen.getByRole('link', { name: 'Go to Fleet administration' })).toHaveAttribute(
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
