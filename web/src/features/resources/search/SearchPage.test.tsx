import { screen, waitFor, within } from '@testing-library/react';
import { delay, http } from 'msw';
import { clusterSwitchPath } from '@/features/cluster-context';
import { COLD_START_TEST_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { expandSection, openSidebar } from '@/test/sidebar';
import { mockViewportWidth } from '@/test/viewport';
import { resourceRoutes } from '../routes';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const LAST_NAMESPACE_KEY = 'fleetconsole.lastNamespace';
const DEPLOYMENTS = 'apps~v1~Deployment';
const PODS = 'core~v1~Pod';
const SERVICES = 'core~v1~Service';
const STATEFULSETS = 'apps~v1~StatefulSet';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  // Toolbar chips collapse behind a toggle below PF's `xl` breakpoint.
  mockViewportWidth(1440);
});

/** The list GETs (not discovery, not access reviews) the page sends, with their URL. */
function recordListRequests(): URL[] {
  const requests: URL[] = [];
  server.use(
    http.get(PROXY, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.has('limit') || url.searchParams.has('watch')) requests.push(url);
      return undefined;
    }),
  );
  return requests;
}

/** Row names (first link of each row) of a result table. */
function rowNames(table: HTMLElement): string[] {
  return within(table)
    .queryAllByRole('row')
    .slice(1)
    .map((row) => within(row).queryAllByRole('link')[0]?.textContent ?? '')
    .filter((name) => name !== '');
}

const searchParams = (router: ReturnType<typeof renderApp>['router']) =>
  new URLSearchParams(router.state.location.search);

describe('Search page (SRCH-1)', () => {
  it(
    'is in the Home navigation and redirects to the last project',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      localStorage.setItem(LAST_NAMESPACE_KEY, JSON.stringify({ 'dev-1': 'shop' }));
      const { user, router } = renderApp('/c/dev-1/search?kind=core~v1~Pod');

      await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/search/ns/shop'));
      expect(searchParams(router).get('kind')).toBe(PODS);
      expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument();

      const nav = await openSidebar(user);
      await expandSection(user, nav, 'Home');
      const home = within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent)
        .filter((label) => ['Projects', 'Search', 'Events'].includes(label));
      expect(home).toEqual(['Projects', 'Search', 'Events']);
      expect(within(nav).getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/c/dev-1/search');
    },
  );

  it('redirects to all projects without a remembered project', async () => {
    const { router } = renderApp('/c/dev-1/search');
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-1/search/all-namespaces'));
  });

  it(
    'shows chips for kinds, labels and name and clears them all',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user, router } = renderApp('/c/dev-1/search/ns/shop');
      expect(await screen.findByRole('heading', { name: 'No resources selected' })).toBeInTheDocument();
      expect(screen.getByText('Select one or more resources from the dropdown.')).toBeInTheDocument();

      // Kinds: typeahead multi-select with checkboxes; the menu stays open across picks.
      const kinds = screen.getByRole('combobox', { name: 'Resources' });
      await user.click(kinds);
      await user.paste('deploy');
      await user.click(await screen.findByRole('checkbox', { name: /Deployment$/ }));
      await waitFor(() => expect(searchParams(router).get('kind')).toBe(DEPLOYMENTS));
      expect(kinds).toHaveAttribute('placeholder', 'Resources (1)');

      // Label: Enter adds a valid `key=value` chip; invalid text is ignored.
      await user.click(screen.getByRole('button', { name: 'Name', expanded: false }));
      await user.click(await screen.findByRole('option', { name: 'Label' }));
      const input = screen.getByPlaceholderText('app=frontend');
      await user.click(input);
      await user.paste('app=web');
      await user.keyboard('{Enter}');
      await waitFor(() => expect(searchParams(router).get('q')).toBe('app=web'));
      expect(input).toHaveValue('');
      await user.paste('=bad');
      await user.keyboard('{Enter}');
      expect(searchParams(router).get('q')).toBe('app=web');
      await user.clear(input);

      // Name: debounced into `?name=`.
      await user.click(screen.getByRole('button', { name: 'Label', expanded: false }));
      await user.click(await screen.findByRole('option', { name: 'Name' }));
      await user.click(screen.getByPlaceholderText('my-resource'));
      await user.paste('we');
      await waitFor(() => expect(searchParams(router).get('name')).toBe('we'));

      const toolbar = screen.getByRole('list', { name: 'Resource' }).closest('.pf-v6-c-toolbar');
      if (!(toolbar instanceof HTMLElement)) throw new Error('toolbar not found');
      expect(within(toolbar).getByRole('list', { name: 'Label' })).toHaveTextContent('app=web');
      expect(within(toolbar).getByRole('list', { name: 'Name' })).toHaveTextContent('we');
      expect(within(toolbar).getByRole('list', { name: 'Resource' })).toHaveTextContent('Deployment');

      const [clearAll] = within(toolbar).getAllByRole('button', { name: 'Clear all filters' });
      if (!clearAll) throw new Error('Clear all filters not found');
      await user.click(clearAll);
      await waitFor(() => expect(router.state.location.search).toBe(''));
      expect(await screen.findByRole('heading', { name: 'No resources selected' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('my-resource')).toHaveValue('');
    },
  );
});

describe('Search results (SRCH-2/3/5)', () => {
  it(
    'shows one section per kind with only the objects matching the label, one list request each and no watch',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      mockK8s.seedPods('dev-1', 'shop', 2);
      const requests = recordListRequests();
      renderApp(
        `/c/dev-1/search/ns/shop?kind=${DEPLOYMENTS},${PODS},${SERVICES},${STATEFULSETS}&q=app%3Dweb`,
      );

      const deployments = await screen.findByRole('grid', { name: 'Deployments' });
      await waitFor(() => expect(rowNames(deployments)).toEqual(['web']));
      const pods = screen.getByRole('grid', { name: 'Pods' });
      await waitFor(() => expect(rowNames(pods)).toHaveLength(3));
      expect(rowNames(pods).every((name) => name.startsWith('web-'))).toBe(true);
      await waitFor(() => expect(rowNames(screen.getByRole('grid', { name: 'Services' }))).toEqual(['web']));
      expect(await screen.findByText('No StatefulSets found')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Deployments/ })).toHaveAttribute('aria-expanded', 'true');

      expect(requests.filter((url) => url.searchParams.has('watch'))).toEqual([]);
      const lists = requests.map((url) => url.pathname.split('/').pop());
      expect(lists.sort()).toEqual(['deployments', 'pods', 'services', 'statefulsets']);
      expect(requests.every((url) => url.searchParams.get('labelSelector') === 'app=web')).toBe(true);
      expect(requests.every((url) => url.pathname.includes('/namespaces/shop/'))).toBe(true);
    },
  );

  it(
    'filters by name client-side and shows a Namespace column in all projects',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const requests = recordListRequests();
      renderApp(`/c/dev-1/search/all-namespaces?kind=${PODS}&name=8mzrt`);

      const pods = await screen.findByRole('grid', { name: 'Pods' });
      await waitFor(() => expect(rowNames(pods)).toEqual(['web-7d4b9c8f6d-8mzrt']));
      expect(within(pods).getByRole('columnheader', { name: /Namespace/ })).toBeInTheDocument();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.searchParams.has('labelSelector')).toBe(false);
      expect(requests[0]?.searchParams.has('name')).toBe(false);
    },
  );

  it(
    'restores the search from the URL and keeps it when switching cluster',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { router } = renderApp(`/c/dev-1/search/ns/shop?kind=${DEPLOYMENTS}&q=app%3Dweb`);

      const deployments = await screen.findByRole('grid', { name: 'Deployments' });
      await waitFor(() => expect(rowNames(deployments)).toEqual(['web']));
      expect(screen.getByRole('combobox', { name: 'Resources' })).toHaveAttribute(
        'placeholder',
        'Resources (1)',
      );
      expect(screen.getByRole('list', { name: 'Label' })).toHaveTextContent('app=web');

      const target = clusterSwitchPath(router.state.location, 'prod-k8s-1');
      expect(target).toBe(`/c/prod-k8s-1/search/ns/shop?kind=${encodeURIComponent(DEPLOYMENTS)}&q=app%3Dweb`);
      await router.navigate(target);
      await waitFor(() => expect(router.state.location.pathname).toBe('/c/prod-k8s-1/search/ns/shop'));
      expect(searchParams(router).get('kind')).toBe(DEPLOYMENTS);
      expect(await screen.findByRole('button', { name: /^Deployments/ })).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Label' })).toHaveTextContent('app=web');
    },
  );

  it('ignores kind references it does not know but keeps them in the URL', async () => {
    const { router } = renderApp(`/c/dev-1/search/ns/shop?kind=example.com~v1~Widget`);
    expect(await screen.findByRole('heading', { name: 'No resources selected' })).toBeInTheDocument();
    expect(searchParams(router).get('kind')).toBe('example.com~v1~Widget');
  });

  it(
    'keeps at most 6 lists in flight when 8 kinds are selected',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.get(PROXY, async ({ request }) => {
          if (!new URL(request.url).searchParams.has('limit')) return undefined;
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await released;
          await delay(1);
          inFlight -= 1;
          return undefined;
        }),
      );
      const refs = [
        PODS,
        DEPLOYMENTS,
        SERVICES,
        STATEFULSETS,
        'core~v1~ConfigMap',
        'core~v1~Secret',
        'batch~v1~Job',
        'apps~v1~DaemonSet',
      ];
      renderApp(`/c/dev-1/search/ns/shop?kind=${refs.join(',')}`);

      await waitFor(() => expect(inFlight).toBe(6));
      await delay(50);
      expect(maxInFlight).toBe(6);
      release();
      await waitFor(() => expect(screen.getAllByRole('grid')).toHaveLength(8));
      await waitFor(() => expect(inFlight).toBe(0));
      expect(maxInFlight).toBe(6);
    },
  );
});

describe('Search kinds on a Kubernetes cluster (DSC-4)', () => {
  it(
    'offers only kinds the cluster serves, no OpenShift-only kinds',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp('/c/prod-k8s-1/search/ns/shop');
      await user.click(await screen.findByRole('combobox', { name: 'Resources' }));

      // StorageClass is outside the discovery baseline: once offered, discovery has answered.
      expect(await screen.findByRole('checkbox', { name: /StorageClass$/ })).toBeInTheDocument();
      for (const kind of [
        'Route',
        'Project',
        'DeploymentConfig',
        'ClusterOperator',
        'ClusterServiceVersion',
        'Machine',
        'MachineSet',
      ]) {
        expect(screen.queryByRole('checkbox', { name: new RegExp(`${kind}$`) })).not.toBeInTheDocument();
      }
    },
  );
});
