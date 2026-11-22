import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { AccessibleCluster } from '@/shared/api';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS } from '@/test/coldStart';
import { credentialIds, mockDb, mockGuid, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { expandSection, openSidebar } from '@/test/sidebar';
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

/** The cluster switcher toggle at the top of the sidebar (UX.md §2), opening the sidebar first. */
async function findSwitcher(user: UserEvent, toggleName: string | RegExp, timeout?: number) {
  const nav = await openSidebar(user, timeout);
  return within(nav).findByRole('button', { name: toggleName }, { timeout });
}

/** Opens the sidebar cluster switcher and returns its options. */
async function openSwitcher(user: UserEvent, toggleName: string | RegExp, timeout?: number) {
  await user.click(await findSwitcher(user, toggleName, timeout));
  const list = await screen.findByRole('listbox', { name: 'All clusters' });
  return within(list).getAllByRole('option');
}

/** The option showing cluster `name`; fails the test when it is missing. */
function optionOf(options: HTMLElement[], name: string): HTMLElement {
  const option = options.find((candidate) => within(candidate).queryByText(name));
  if (!option) throw new Error(`No option for cluster ${name}`);
  return option;
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

      const toggle = await findSwitcher(
        user,
        'Cluster prod-eu-1 (prod, read only), switch cluster',
        COLD_START_TIMEOUT_MS,
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
    const { user } = renderApp('/admin/users');

    expect(await findSwitcher(user, 'Loading clusters')).toBeDisabled();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    server.use(
      http.get('*/api/clusters', () => HttpResponse.json({ title: 'Down' }, { status: 503 }), {
        once: true,
      }),
    );
    const { user } = renderApp('/admin/users');

    await user.click(await findSwitcher(user, 'Clusters unavailable — retry'));

    // Outside a cluster the toggle names the preferred cluster (the one the sidebar links target), never a blank.
    const options = await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    expect(optionNames(options)).toEqual(['dev-1']);
  });

  it('shows a disabled "No clusters" toggle to a user without grants', async () => {
    setMockUser('bob');
    const { user } = renderApp('/');

    expect(await findSwitcher(user, 'No clusters')).toBeDisabled();
    // Nothing follows the switcher, so there is no divider under it.
    expect(within(await openSidebar(user)).queryByRole('separator')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).queryByRole('button', { name: 'No clusters' }),
    ).not.toBeInTheDocument();
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

    // Like OCP's menu search: no submit button (Enter opens the first match instead).
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
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

  it('shows and selects the preferred cluster on a non-cluster page', async () => {
    grantAllClusters();
    localStorage.setItem(LAST_CLUSTER_KEY, 'staging-eu-1');
    const { user } = renderApp('/admin/users');

    const options = await openSwitcher(user, 'Cluster staging-eu-1 (staging), switch cluster');
    const selected = options.filter((option) => option.getAttribute('aria-selected') === 'true');
    expect(optionNames(selected)).toEqual(['staging-eu-1']);
  });

  it('works by keyboard: Enter opens with the search focused, Escape closes back onto the toggle', async () => {
    const { user } = renderApp('/c/dev-1/overview');

    const toggle = await findSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    toggle.focus();
    await user.keyboard('{Enter}');
    const search = await screen.findByRole('textbox', { name: 'Search clusters' });
    await waitFor(() => expect(search).toHaveFocus());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(toggle).toHaveFocus());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
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

    await openSwitcher(user, 'Cluster prod-eu-1 (prod, read only), switch cluster');
    const recent = screen.getByRole('listbox', { name: 'Recent clusters' });
    expect(optionNames(within(recent).getAllByRole('option'))).toEqual(['staging-eu-1']);
  });

  it('has no Recent group when it would repeat All clusters', async () => {
    localStorage.setItem(recentKey('admin'), JSON.stringify(['dev-1']));
    const { user } = renderApp('/c/dev-1/overview');

    const options = await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    expect(optionNames(options)).toEqual(['dev-1']);
    expect(screen.queryByRole('listbox', { name: 'Recent clusters' })).not.toBeInTheDocument();
  });

  it('has no Recent group when it would hold only the shown cluster (T-0119)', async () => {
    setMockUser('alice');
    const { user } = renderApp('/c/prod-eu-1/overview');

    const options = await openSwitcher(user, 'Cluster prod-eu-1 (prod, read only), switch cluster');
    expect(optionNames(options)).toContain('staging-eu-1');
    expect(screen.queryByRole('listbox', { name: 'Recent clusters' })).not.toBeInTheDocument();
  });

  it('has no Recent group for a fresh user', async () => {
    localStorage.setItem(recentKey('alice'), JSON.stringify(['dev-1']));
    const { user } = renderApp('/admin/users');

    await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    expect(screen.queryByRole('listbox', { name: 'Recent clusters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument();
  });
});

describe('ClusterSwitcher keeps context (SW-9)', () => {
  it('keeps the path and filters when switching between clusters', async () => {
    grantAllClusters();
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/pods?label=app%3Dweb');

    const options = await openSwitcher(user, 'Cluster dev-1 (dev), switch cluster');
    await user.click(optionOf(options, 'dev-2'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-2/k8s/ns/shop/pods'));
    expect(router.state.location.search).toBe('?label=app%3Dweb');
    // The switcher re-renders with the new cluster after the navigation commits; wait for its new name and focus.
    const toggle = await screen.findByRole('button', { name: 'Cluster dev-2 (dev), switch cluster' });
    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it('goes to the cluster root from a non-cluster page', async () => {
    grantAllClusters();
    const { user, router } = renderApp('/admin/users');

    const options = await openSwitcher(user, /switch cluster$/);
    await user.click(optionOf(options, 'dev-2'));

    // `/c/dev-2` — the cluster's index route then picks its landing page (Projects, or Namespaces when discovery
    // fails: the mock proxy has no grant for admin on dev-2, only the switcher list is widened here).
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\/dev-2\/k8s\/cluster\//));
  });
});

describe('landing on / (SW-3/SW-4)', () => {
  it('goes to the remembered cluster when it is still granted', async () => {
    setMockUser('alice');
    localStorage.setItem(LAST_CLUSTER_KEY, 'staging-eu-1');
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/staging-eu-1/k8s/cluster/projects'));
  });

  it('ignores a stale remembered cluster and goes to the first one', async () => {
    setMockUser('alice');
    localStorage.setItem(LAST_CLUSTER_KEY, 'dev-1');
    const { router } = renderApp('/');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/prod-eu-1/k8s/cluster/projects'));
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

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/k8s/cluster/projects'));
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
    expect(screen.getByRole('link', { name: 'Return to homepage' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: 'Select a cluster' })).toBeInTheDocument();
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
    await expandSection(user, nav, 'Home');
    expect(within(nav).getByRole('link', { name: 'Events' })).toHaveAttribute(
      'href',
      '/c/prod-eu-1/k8s/events',
    );
  });

  // T-0097: the sidebar never links into clusters from the "not available" page; admins keep Fleet administration.
  it('are hidden on the "not available" page and come back after switching to a granted cluster', async () => {
    localStorage.setItem(LAST_CLUSTER_KEY, 'dev-1');
    const { user } = renderApp('/c/nope/overview');

    await screen.findByRole('heading', { name: 'Cluster nope is not available' });
    const nav = await openSidebar(user);
    const sectionTitles = () =>
      within(nav)
        .getAllByRole('button')
        .slice(1) // the cluster switcher ("Select a cluster": the URL's cluster is not in the list)
        .map((button) => button.textContent);
    expect(sectionTitles()).toEqual(['Fleet administration']);
    expect(within(nav).queryByRole('link', { name: 'Events' })).not.toBeInTheDocument();

    await user.click(within(nav).getByRole('button', { name: 'Select a cluster' }));
    await user.click(await screen.findByRole('option', { name: /dev-1/ }));

    await expandSection(user, nav, 'Home');
    expect(within(nav).getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/c/dev-1/k8s/events');
    expect(sectionTitles()).toContain('Fleet administration');
  });

  it('open from the "not available" page: its "Select a cluster" opens the sidebar switcher', async () => {
    const { user, router } = renderApp('/c/nope/overview');

    await screen.findByRole('heading', { name: 'Cluster nope is not available' });
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: 'Select a cluster' }));
    await user.click(await screen.findByRole('option', { name: /dev-1/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/overview'));
  });

  it('are absent for a non-admin on the "not available" page', async () => {
    setMockUser('alice');
    const { user } = renderApp('/c/nope/overview');

    await screen.findByRole('heading', { name: 'Cluster nope is not available' });
    const nav = await openSidebar(user);
    expect(within(nav).queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Events' })).not.toBeInTheDocument();
  });

  it('are hidden for a user without clusters', async () => {
    setMockUser('bob');
    const { user } = renderApp('/');

    await screen.findByRole('heading', { name: 'No clusters assigned yet' });
    const nav = await openSidebar(user);
    expect(within(nav).queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Events' })).not.toBeInTheDocument();
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
