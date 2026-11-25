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
  const all: AccessibleCluster[] = mockDb.clusters.map(
    ({ name, displayName, environment, distribution }) => ({
      name,
      displayName,
      environment,
      distribution,
      accessMode: 'readWrite',
      webConsoleUrl: null,
    }),
  );
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
        'Cluster Production EU 1 (prod-eu-1, OCP, prod, read only), switch cluster',
        COLD_START_TIMEOUT_MS,
      );
      // One line (SW-2, SW-5): OpenShift icon, display name, then the environment tag (no `OCP` tag, T-0203);
      // "Read only" only in the accessible name.
      expect(within(toggle).getByRole('heading', { level: 2 })).toHaveTextContent('Production EU 1');
      expect(within(toggle).queryByText('OCP')).not.toBeInTheDocument();
      expect(within(toggle).getByText('prod')).toBeInTheDocument();
      expect(within(toggle).queryByText('Read only')).not.toBeInTheDocument();

      const options = await openSwitcher(
        user,
        'Cluster Production EU 1 (prod-eu-1, OCP, prod, read only), switch cluster',
      );
      expect(optionNames(options)).toEqual(['prod-eu-1', 'prod-k8s-1', 'staging-eu-1', 'lab-1']);
      const [prod, prodK8s, staging] = options as [HTMLElement, HTMLElement, HTMLElement];
      expect(within(prod).getByText('prod')).toBeInTheDocument();
      expect(within(prod).getByText('Read only')).toBeInTheDocument();
      expect(within(prod).getByText('Production EU 1')).toBeInTheDocument();
      expect(within(prod).queryByText('OCP')).not.toBeInTheDocument();
      // Labels in UX.md §2a order: [K8s], environment, Read only (SW-5); OpenShift has no type tag (T-0203).
      expect(prod).toHaveTextContent(/Production EU 1\s*prod\s*Read only/);
      // FND-1: the production Kubernetes cluster alice reads read-only.
      expect(prodK8s).toHaveTextContent(/K8s\s*prod\s*Read only/);
      expect(within(staging).getByText('staging')).toBeInTheDocument();
      expect(within(staging).queryByText('Read only')).not.toBeInTheDocument();
    },
  );

  it('marks every cluster read-only for a globally read-only user (effective access mode)', async () => {
    setMockUser('ines');
    // Give ines a ReadWrite grant as well: the effective mode must still be read-only.
    mockDb.grants.push({
      id: mockGuid(0x2ff),
      subjectKind: 'user',
      subjectName: 'ines',
      priority: null,
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

    const options = await openSwitcher(
      user,
      'Cluster Development 1 (dev-1, OCP, dev, read only), switch cluster',
    );
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
    const { user } = renderApp('/user-preferences/general');

    expect(await findSwitcher(user, 'Loading clusters')).toBeDisabled();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    setMockUser('alice');
    server.use(
      http.get('*/api/clusters', () => HttpResponse.json({ title: 'Down' }, { status: 503 }), {
        once: true,
      }),
    );
    const { user } = renderApp('/user-preferences/general');

    // The toggle still opens (Fleet management stays reachable, FLT-1); the menu offers the retry row and, with
    // nothing to search, no search box.
    await user.click(await findSwitcher(user, 'Select a cluster'));
    expect(screen.getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Search clusters' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Clusters unavailable — retry' }));

    // The search box appears with the clusters.
    expect(await screen.findByRole('combobox', { name: 'Search clusters' })).toBeInTheDocument();
    const list = screen.getByRole('listbox', { name: 'All clusters' });
    expect(optionNames(within(list).getAllByRole('option'))).toEqual([
      'prod-eu-1',
      'prod-k8s-1',
      'staging-eu-1',
      'lab-1',
    ]);
    // Outside a cluster the toggle names the preferred cluster (the one the sidebar links target), never a blank.
    expect(
      await findSwitcher(user, 'Cluster Production EU 1 (prod-eu-1, OCP, prod, read only), switch cluster'),
    ).toBeInTheDocument();
  });

  it('still offers Fleet management to a user without grants (FLT-1)', async () => {
    setMockUser('bob');
    const { user } = renderApp('/');

    const toggle = await findSwitcher(user, 'Select a cluster');
    // Same h2 title as the other toggle states (OCP NavHeader).
    expect(within(toggle).getByRole('heading', { level: 2 })).toHaveTextContent('Select a cluster');
    await user.click(toggle);
    expect(await screen.findByRole('option', { name: 'Fleet management' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('listbox', { name: 'All clusters' })).getByText('No clusters'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Search clusters' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
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

    await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    const search = screen.getByRole('combobox', { name: 'Search clusters' });
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

    await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    await user.paste('prod');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/prod-eu-1/overview'));
    expect(screen.queryByRole('listbox', { name: 'All clusters' })).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');

    await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    await user.paste('zzz');

    const list = screen.getByRole('listbox', { name: 'All clusters' });
    expect(within(list).getByRole('option', { name: 'No clusters match "zzz"' })).toBeDisabled();
  });

  it('marks the active cluster as selected', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/staging-eu-1/overview');

    const options = await openSwitcher(
      user,
      'Cluster Staging EU 1 (staging-eu-1, OCP, staging), switch cluster',
    );
    const selected = options.filter((option) => option.getAttribute('aria-selected') === 'true');
    expect(optionNames(selected)).toEqual(['staging-eu-1']);
  });

  it('shows and selects the preferred cluster on a non-cluster page', async () => {
    grantAllClusters();
    localStorage.setItem(LAST_CLUSTER_KEY, 'staging-eu-1');
    const { user } = renderApp('/user-preferences/general');

    const options = await openSwitcher(
      user,
      'Cluster Staging EU 1 (staging-eu-1, OCP, staging), switch cluster',
    );
    const selected = options.filter((option) => option.getAttribute('aria-selected') === 'true');
    expect(optionNames(selected)).toEqual(['staging-eu-1']);
  });

  it('works by keyboard: Enter opens with the search focused, Escape closes back onto the toggle', async () => {
    const { user } = renderApp('/c/dev-1/overview');

    const toggle = await findSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    toggle.focus();
    await user.keyboard('{Enter}');
    const search = await screen.findByRole('combobox', { name: 'Search clusters' });
    await waitFor(() => expect(search).toHaveFocus());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(toggle).toHaveFocus());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ClusterSwitcher cluster identity (SW-1..6)', () => {
  it('lists the display name with the cluster name as description and the type tag', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');

    const options = await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    const lab = optionOf(options, 'lab-1');
    expect(within(lab).getByText('Lab 1')).toBeInTheDocument();
    expect(within(lab).getByText('lab-1')).toBeInTheDocument();
    expect(lab).toHaveTextContent(/Lab 1\s*K8s\s*dev/);
  });

  it('shows the full display name and, on a second line, the cluster name in the toggle tooltip', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/lab-1/overview');

    const toggle = await findSwitcher(user, 'Cluster Lab 1 (lab-1, K8s, dev), switch cluster');
    expect(within(toggle).getByText('K8s')).toBeInTheDocument();
    await user.hover(toggle);
    const tooltip = await screen.findByRole('tooltip');
    // Two lines: the (possibly truncated) title in full, then the cluster name.
    expect(within(tooltip).getByText('Lab 1')).toBeInTheDocument();
    expect(within(tooltip).getByText('lab-1')).toBeInTheDocument();
  });

  it('shows only the display name in the toggle tooltip when it equals the cluster name', async () => {
    server.use(
      http.get('*/api/clusters', () =>
        HttpResponse.json([
          {
            name: 'dev-1',
            displayName: 'dev-1',
            environment: 'development',
            distribution: 'openShift',
            accessMode: 'readWrite',
            webConsoleUrl: null,
          } satisfies AccessibleCluster,
        ]),
      ),
    );
    const { user } = renderApp('/c/dev-1/overview');

    const toggle = await findSwitcher(user, 'Cluster dev-1 (OCP, dev), switch cluster');
    await user.hover(toggle);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^dev-1$/);
  });

  it('truncates a long display name in the menu, keeping it in full in the option name and a tooltip (T-0152)', async () => {
    const longName = 'Lab cluster with a deliberately very long display name, sixt';
    server.use(
      http.get('*/api/clusters', () =>
        HttpResponse.json([
          {
            name: 'lab-1',
            displayName: longName,
            environment: 'development',
            distribution: 'kubernetes',
            accessMode: 'readWrite',
            webConsoleUrl: null,
          } satisfies AccessibleCluster,
        ]),
      ),
    );
    const { user } = renderApp('/c/lab-1/overview');

    const option = optionOf(
      await openSwitcher(user, `Cluster ${longName} (lab-1, K8s, dev), switch cluster`),
      'lab-1',
    );
    expect(option).toHaveAccessibleName(expect.stringContaining(longName));
    const name = within(option).getByText(longName);
    expect(name.closest('.pf-v6-c-truncate')).not.toBeNull();
    await user.hover(name);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(longName);
  });

  it('keeps the name and its labels on one line (FND-2, T-0371)', async () => {
    const displayName = 'Production Kubernetes Frankfurt 1';
    server.use(
      http.get('*/api/clusters', () =>
        HttpResponse.json([
          {
            name: 'prod-k8s-1',
            displayName,
            environment: 'production',
            distribution: 'kubernetes',
            accessMode: 'readOnly',
            webConsoleUrl: null,
          } satisfies AccessibleCluster,
        ]),
      ),
    );
    const { user } = renderApp('/c/prod-k8s-1/overview');

    const option = optionOf(
      await openSwitcher(user, `Cluster ${displayName} (prod-k8s-1, K8s, prod, read only), switch cluster`),
      'prod-k8s-1',
    );
    // jsdom has no layout: assert the structure that keeps "name … labels" on one line (T-0371): no wrapping, the
    // name shrinks and truncates, the label group never shrinks.
    const nameItem = within(option).getByText(displayName).closest('.pf-v6-c-truncate')?.parentElement;
    const row = nameItem?.parentElement;
    expect(row).toHaveClass('pf-v6-l-flex', 'pf-m-nowrap');
    expect(nameItem).toHaveClass('pf-m-flex-1', 'pf-v6-u-min-width');
    const typeTag = within(option).getByText('K8s');
    const labelGroup = typeTag.closest('.pf-v6-l-flex');
    expect(labelGroup).not.toBe(row);
    expect(labelGroup?.parentElement).toHaveClass('pf-m-flex-none');
    expect(labelGroup?.parentElement?.parentElement).toBe(row);
    for (const tag of ['K8s', 'prod', 'Read only']) expect(labelGroup).toContainElement(within(option).getByText(tag));
    expect(nameItem).not.toContainElement(typeTag);
  });

  it('opens the menu outside the scrolling sidebar (T-0371)', async () => {
    const { user } = renderApp('/c/dev-1/overview');

    const options = await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    const menu = options[0]?.closest('.pf-v6-c-menu');
    expect(menu).not.toBeNull();
    // PF's Popper sets the 25rem width in a layout modifier that jsdom doesn't run, so only placement is asserted.
    expect(menu?.closest('.pf-v6-c-page__sidebar')).toBeNull();
  });

  it.each([
    ['k8s', ['prod-k8s-1', 'dev-2', 'lab-1']],
    ['kubernetes', ['prod-k8s-1', 'dev-2', 'lab-1']],
    ['ocp', ['prod-eu-1', 'prod-us-1', 'staging-eu-1', 'dev-1']],
    ['OpenShift', ['prod-eu-1', 'prod-us-1', 'staging-eu-1', 'dev-1']],
  ])('filters by cluster type "%s"', async (text, expected) => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');

    await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    await user.paste(text);
    const list = screen.getByRole('listbox', { name: 'All clusters' });
    expect(optionNames(within(list).getAllByRole('option'))).toEqual(expected);
  });
});

describe('ClusterSwitcher keyboard (T-0153)', () => {
  // PF scrolls the focused row into view; jsdom has no layout, so no `scrollIntoView`.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  /** Opens the switcher on dev-1 as admin and returns the focused search combobox. */
  async function openSearch(user: UserEvent) {
    await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    const search = screen.getByRole('combobox', { name: 'Search clusters' });
    await waitFor(() => expect(search).toHaveFocus());
    return search;
  }

  /** The `option` the combobox's `aria-activedescendant` points at, or null. */
  function activeOption(search: HTMLElement): HTMLElement | null {
    const id = search.getAttribute('aria-activedescendant');
    return id ? (screen.getAllByRole('option').find((option) => option.id === id) ?? null) : null;
  }

  it('is a combobox controlling the menu lists', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');

    const search = await openSearch(user);
    expect(search).toHaveAttribute('aria-expanded', 'true');
    expect(search).toHaveAttribute('aria-autocomplete', 'list');
    expect(search).not.toHaveAttribute('aria-activedescendant');
    const controlled = (search.getAttribute('aria-controls') ?? '').split(' ');
    expect(controlled).toEqual(screen.getAllByRole('listbox').map((list) => list.id));
  });

  it('moves through Fleet management and the clusters with the arrows, wrapping at the ends', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');
    const search = await openSearch(user);
    const clusters = optionNames(
      within(screen.getByRole('listbox', { name: 'All clusters' })).getAllByRole('option'),
    );

    await user.keyboard('{ArrowDown}');
    const fleet = screen.getByRole('option', { name: 'Fleet management' });
    expect(activeOption(search)).toBe(fleet);
    expect(fleet.closest('li')).toHaveClass('pf-m-focus');
    expect(search).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(optionNames([activeOption(search) ?? search])).toEqual([clusters[0]]);
    expect(fleet.closest('li')).not.toHaveClass('pf-m-focus');

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(optionNames([activeOption(search) ?? search])).toEqual([clusters[clusters.length - 1]]);
    await user.keyboard('{ArrowDown}');
    expect(activeOption(search)).toBe(fleet);
  });

  it('opens the focused cluster on Enter', async () => {
    grantAllClusters();
    const { user, router } = renderApp('/c/dev-1/overview');
    const search = await openSearch(user);

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    const [target] = optionNames([activeOption(search) ?? search]);
    expect(target).not.toBe('dev-1');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${target}/overview`));
    expect(screen.queryByRole('listbox', { name: 'All clusters' })).not.toBeInTheDocument();
  });

  it('opens Fleet management on Enter', async () => {
    const { user, router } = renderApp('/c/dev-1/overview');
    await openSearch(user);

    await user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/overview'));
  });

  it('resets the focused row when typing, and Escape returns to the toggle', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');
    const search = await openSearch(user);

    await user.keyboard('{ArrowDown}');
    expect(search).toHaveAttribute('aria-activedescendant');
    await user.keyboard('p');
    expect(search).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('option', { name: 'Fleet management' })?.closest('li')).not.toHaveClass(
      'pf-m-focus',
    );

    await user.keyboard('{ArrowDown}{Escape}');
    const toggle = screen.getByRole('button', {
      name: 'Cluster Development 1 (dev-1, OCP, dev), switch cluster',
    });
    await waitFor(() => expect(toggle).toHaveFocus());
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ClusterSwitcher recent clusters (SW-8)', () => {
  it('lists the previously used cluster, per user, and hides the group while searching', async () => {
    grantAllClusters();
    const { user } = renderApp('/c/dev-1/overview');

    const options = await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    await user.click(optionOf(options, 'prod-eu-1'));
    await user.click(
      await screen.findByRole('button', {
        name: 'Cluster Production EU 1 (prod-eu-1, OCP, prod), switch cluster',
      }),
    );

    const recent = await screen.findByRole('listbox', { name: 'Recent clusters' });
    // Only the last used cluster other than the shown one (T-0371); the list keeps both.
    expect(optionNames(within(recent).getAllByRole('option'))).toEqual(['dev-1']);
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
    const { user } = renderApp('/user-preferences/general');

    await openSwitcher(user, 'Cluster Production EU 1 (prod-eu-1, OCP, prod, read only), switch cluster');
    const recent = screen.getByRole('listbox', { name: 'Recent clusters' });
    expect(optionNames(within(recent).getAllByRole('option'))).toEqual(['staging-eu-1']);
  });

  it('shows exactly one Recent cluster, the last used other than the shown one (T-0371)', async () => {
    localStorage.setItem(recentKey('admin'), JSON.stringify(['prod-k8s-1', 'dev-1', 'lab-1']));
    const { user } = renderApp('/c/dev-1/overview');

    await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    const recent = screen.getByRole('listbox', { name: 'Recent clusters' });
    expect(optionNames(within(recent).getAllByRole('option'))).toEqual(['prod-k8s-1']);
    const all = screen.getByRole('listbox', { name: 'All clusters' });
    expect(optionNames(within(all).getAllByRole('option'))).toEqual(['prod-k8s-1', 'dev-1', 'lab-1']);
  });

  it('has no Recent group when it would hold only the shown cluster (T-0119)', async () => {
    setMockUser('alice');
    const { user } = renderApp('/c/prod-eu-1/overview');

    const options = await openSwitcher(
      user,
      'Cluster Production EU 1 (prod-eu-1, OCP, prod, read only), switch cluster',
    );
    expect(optionNames(options)).toContain('staging-eu-1');
    expect(screen.queryByRole('listbox', { name: 'Recent clusters' })).not.toBeInTheDocument();
  });

  it('has no Recent group for a fresh user', async () => {
    localStorage.setItem(recentKey('alice'), JSON.stringify(['dev-1']));
    const { user } = renderApp('/user-preferences/general');

    await openSwitcher(
      user,
      'Cluster Production Kubernetes Frankfurt 1 (prod-k8s-1, K8s, prod), switch cluster',
    );
    expect(screen.queryByRole('listbox', { name: 'Recent clusters' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent' })).not.toBeInTheDocument();
  });
});

describe('ClusterSwitcher keeps context (SW-9)', () => {
  it('keeps the path and filters when switching between clusters', async () => {
    grantAllClusters();
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/pods?label=app%3Dweb');

    const options = await openSwitcher(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    await user.click(optionOf(options, 'dev-2'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-2/k8s/ns/shop/pods'));
    expect(router.state.location.search).toBe('?label=app%3Dweb');
    // The switcher re-renders with the new cluster after the navigation commits; wait for its new name and focus.
    const toggle = await screen.findByRole('button', {
      name: 'Cluster Development 2 (dev-2, K8s, dev), switch cluster',
    });
    await waitFor(() => expect(toggle).toHaveFocus());
  });

  it('goes to the cluster root from a non-cluster page', async () => {
    grantAllClusters();
    const { user, router } = renderApp('/fleet/admin/users');

    const options = await openSwitcher(user, /switch cluster$/);
    await user.click(optionOf(options, 'dev-2'));

    // `/c/dev-2` — the cluster's index route then picks its landing page (Projects, or Namespaces when discovery
    // fails: the mock proxy has no grant for admin on dev-2, only the switcher list is widened here).
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\/dev-2\/k8s\/cluster\//));
  });
});

describe('ClusterSwitcher fleet perspective (FLEET-1/2/5)', () => {
  /** Opens the switcher menu and returns its "Fleet" list, or null when the menu has none. */
  async function openFleetList(user: UserEvent, toggleName: string | RegExp) {
    await user.click(await findSwitcher(user, toggleName));
    await screen.findByRole('listbox', { name: 'All clusters' });
    return screen.queryByRole('listbox', { name: 'Fleet' });
  }

  it.each(['admin', 'ines'])(
    'offers "Fleet management" first to %s, also while searching',
    async (username) => {
      setMockUser(username);
      const { user } = renderApp('/fleet/admin/users');

      await openFleetList(user, 'Fleet management, switch cluster');
      const fleet = screen.getByRole('listbox', { name: 'Fleet' });
      // First list of the menu, before Recent / All clusters.
      expect(screen.getAllByRole('listbox')[0]).toBe(fleet);
      expect(within(fleet).getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();

      await user.type(screen.getByRole('combobox', { name: 'Search clusters' }), 'zzz');
      expect(screen.getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();
      // Enter opens the first cluster match only; with none it stays put.
      await user.keyboard('{Enter}');
      expect(screen.getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();
    },
  );

  it('offers it to a non-admin too (FLT-1)', async () => {
    setMockUser('alice');
    const { user } = renderApp('/c/prod-eu-1/overview');

    expect(await openFleetList(user, /switch cluster$/)).not.toBeNull();
    expect(screen.getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();
  });

  it('goes to /fleet/overview and shows the fleet toggle there, with the entry selected', async () => {
    const { user, router } = renderApp('/c/dev-1/overview');

    await openFleetList(user, 'Cluster Development 1 (dev-1, OCP, dev), switch cluster');
    await user.click(screen.getByRole('option', { name: 'Fleet management' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/overview'));
    const toggle = await screen.findByRole('button', { name: 'Fleet management, switch cluster' });
    expect(within(toggle).getByRole('heading', { level: 2 })).toHaveTextContent('Fleet management');
    // No environment or read-only labels on the fleet toggle.
    expect(toggle).toHaveTextContent(/^Fleet management$/);

    await user.click(toggle);
    expect(await screen.findByRole('option', { name: 'Fleet management' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const all = screen.getByRole('listbox', { name: 'All clusters' });
    expect(within(all).queryAllByRole('option', { selected: true })).toEqual([]);
  });

  it('shows the fleet toggle to a non-admin on a fleet page', async () => {
    setMockUser('alice');
    const { user } = renderApp('/fleet/admin/users');

    await screen.findByRole('heading', { name: "You don't have access to Fleet administration" });
    const nav = await openSidebar(user);
    expect(within(nav).getByRole('button', { name: 'Fleet management, switch cluster' })).toBeInTheDocument();
  });

  it('returns to the cluster sidebar when a cluster is chosen on a fleet page', async () => {
    const { user, router } = renderApp('/fleet/admin/users');

    await openFleetList(user, 'Fleet management, switch cluster');
    await user.click(screen.getByRole('option', { name: /dev-1/ }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\/dev-1\//));
    const nav = await openSidebar(user);
    expect(
      await within(nav).findByRole('button', {
        name: 'Cluster Development 1 (dev-1, OCP, dev), switch cluster',
      }),
    ).toBeInTheDocument();
    expect(await within(nav).findByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Fleet administration' })).not.toBeInTheDocument();
  });

  it('keeps Fleet management reachable for an admin whose cluster list failed, with a retry row', async () => {
    server.use(
      http.get('*/api/clusters', () => HttpResponse.json({ title: 'Down' }, { status: 503 }), { once: true }),
    );
    const { user, router } = renderApp('/user-preferences/general');

    await openFleetList(user, 'Select a cluster');
    expect(screen.getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Clusters unavailable — retry' }));
    expect(await screen.findByRole('option', { name: /dev-1/ })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Fleet management' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/fleet/overview'));
  });

  it('keeps Fleet management reachable for an admin without grants outside a fleet page', async () => {
    server.use(http.get('*/api/clusters', () => HttpResponse.json([])));
    const { user } = renderApp('/user-preferences/general');

    const toggle = await findSwitcher(user, 'Select a cluster');
    expect(toggle).toBeEnabled();
    await openFleetList(user, 'Select a cluster');
    expect(screen.getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('listbox', { name: 'All clusters' })).getByText('No clusters'),
    ).toBeInTheDocument();
  });

  it.each(['/c/dev-1/overview', '/fleet/admin/users'])(
    'keeps the menu open with a "Loading clusters" row while a retry refetches (%s)',
    async (path) => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      server.use(
        http.get('*/api/clusters', async () => {
          calls += 1;
          if (calls === 1) return HttpResponse.json({ title: 'Down' }, { status: 503 });
          // Returning nothing falls through to the default handler (the admin's real list).
          await gate;
        }),
      );
      const { user } = renderApp(path);

      await openFleetList(user, /^(Select a cluster|Fleet management, switch cluster)$/);
      await user.click(screen.getByRole('option', { name: 'Clusters unavailable — retry' }));

      const all = screen.getByRole('listbox', { name: 'All clusters' });
      expect(await within(all).findByText('Loading clusters')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Loading clusters' })).not.toBeInTheDocument();
      // Nothing to search yet (F2): the search box comes back with the clusters.
      expect(screen.queryByRole('combobox', { name: 'Search clusters' })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();

      release();
      expect(await screen.findByRole('option', { name: /dev-1/ })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Search clusters' })).toBeInTheDocument();
    },
  );

  it('offers a retry row on a fleet page when the cluster list failed', async () => {
    server.use(
      http.get('*/api/clusters', () => HttpResponse.json({ title: 'Down' }, { status: 503 }), { once: true }),
    );
    const { user } = renderApp('/fleet/admin/users');

    await openFleetList(user, 'Fleet management, switch cluster');
    await user.click(screen.getByRole('option', { name: 'Clusters unavailable — retry' }));
    expect(await screen.findByRole('option', { name: /dev-1/ })).toBeInTheDocument();
  });

  it('lists the fleet entry for an admin without clusters on a fleet page', async () => {
    server.use(http.get('*/api/clusters', () => HttpResponse.json([])));
    const { user } = renderApp('/fleet/admin/users');

    await openFleetList(user, 'Fleet management, switch cluster');
    expect(screen.getByRole('option', { name: 'Fleet management' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('listbox', { name: 'All clusters' })).getByText('No clusters'),
    ).toBeInTheDocument();
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
      '/fleet/admin/users',
    );
    expect(screen.getByText(/Admins need a grant too/)).toHaveTextContent(
      'Admins need a grant too: grant yourself access from your user page.',
    );
    expect(screen.getByRole('link', { name: 'grant yourself access from your user page' })).toHaveAttribute(
      'href',
      '/fleet/admin/users/admin/access',
    );
  });

  it('tells a read-only admin without grants to ask another administrator (ADM-2)', async () => {
    setMockUser('ines');
    server.use(http.get('*/api/clusters', () => HttpResponse.json([])));
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'No clusters assigned yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Fleet administration' })).toHaveAttribute(
      'href',
      '/fleet/admin/users',
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

    // admin's first granted cluster is the Kubernetes prod-k8s-1, which lands on Namespaces.
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/prod-k8s-1/k8s/cluster/namespaces'));
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
    const { user } = renderApp('/user-preferences/general');

    const nav = await openSidebar(user);
    await expandSection(user, nav, 'Home');
    expect(within(nav).getByRole('link', { name: 'Events' })).toHaveAttribute(
      'href',
      '/c/prod-eu-1/k8s/events',
    );
  });

  // T-0097: the sidebar never links into clusters from the "not available" page; Fleet administration is in the fleet
  // perspective only (FLEET-4), so an admin sees no sections there either.
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
    expect(sectionTitles()).toEqual([]);
    expect(within(nav).queryByRole('link', { name: 'Events' })).not.toBeInTheDocument();

    await user.click(within(nav).getByRole('button', { name: 'Select a cluster' }));
    await user.click(await screen.findByRole('option', { name: /dev-1/ }));

    await expandSection(user, nav, 'Home');
    expect(within(nav).getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/c/dev-1/k8s/events');
    expect(sectionTitles()).not.toContain('Fleet administration');
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

    expect(await screen.findByText('3 clusters')).toBeInTheDocument();
    const query = queryClient.getQueryCache().find({ queryKey: accessibleClustersQueryKey, exact: true });
    expect(accessibleClustersQueryKey).toEqual(['api', 'clusters']);
    expect(query?.options).toMatchObject({
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchInterval: 300_000,
    });
  });
});
