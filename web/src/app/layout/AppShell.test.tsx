import { act, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { LOGO_SRC } from '@/shared/branding';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS } from '@/test/coldStart';
import { setMockUser } from '@/test/handlers';
import { server } from '@/test/server';
import { expandSection, openSidebar } from '@/test/sidebar';
import { renderApp } from '@/test/render';

/**
 * Fakes `matchMedia` (jsdom has none) for `prefers-color-scheme: dark` and `prefers-contrast: more`. Call before
 * rendering; the setters flip the OS setting and fire `change` like a browser does.
 */
function mockOsMedia({ dark = false, moreContrast = false }: { dark?: boolean; moreContrast?: boolean }) {
  const state = { dark, moreContrast };
  const listeners = new Set<() => void>();
  const queryFor = (media: string) =>
    ({
      get matches() {
        return media.includes('prefers-contrast') ? state.moreContrast : state.dark;
      },
      addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
    }) as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(queryFor));
  const set = (change: Partial<typeof state>) => {
    Object.assign(state, change);
    act(() => listeners.forEach((listener) => listener()));
  };
  return {
    setDark: (value: boolean) => set({ dark: value }),
    setMoreContrast: (value: boolean) => set({ moreContrast: value }),
  };
}

/** Opens Help › About and returns the About dialog. */
async function openAbout(user: UserEvent) {
  await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Help menu' }));
  await user.click(await screen.findByRole('menuitem', { name: 'About' }));
  return screen.findByRole('dialog', { name: 'Consolinho' });
}

describe('AppShell', () => {
  // First full-app render of the file: its first wait gets the documented cold-start allowance (T-0046).
  it(
    'renders a masthead with only brand, help menu and user menu, and the cluster switcher atop the sidebar',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { user } = renderApp('/c/dev-1/overview');

      expect(
        await screen.findByRole('link', { name: 'Consolinho' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toHaveAttribute('href', '/');
      const masthead = screen.getByRole('banner');
      const mastheadButtons = within(masthead)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent);
      expect(mastheadButtons).toEqual([
        'Global navigation',
        'Help menu',
        expect.stringMatching(/Fleet Admin/),
      ]);

      const nav = await openSidebar(user);
      const toggle = await within(nav).findByRole('button', {
        name: 'Cluster Development 1 (dev-1, OCP, dev), switch cluster',
      });
      expect(toggle).toHaveTextContent('dev');
      // First child of the nav, before the sections (UX.md §2); one line: labels inline after the name.
      expect(within(nav).getAllByRole('button')[0]).toBe(toggle);
      expect(within(toggle).getByRole('heading', { level: 2 })).toHaveTextContent('Development 1');
      // No version footer in the sidebar (it moved to Help › About).
      expect(screen.queryByText(/0\.0\.0-test/)).not.toBeInTheDocument();
    },
  );

  // Sections come from the registry (T-0073): only sections with registered kinds are listed; Fleet administration
  // lives in the fleet perspective only (FLEET-4).
  it('renders registry-driven navigation sections and no Fleet administration on cluster pages', async () => {
    const { user } = renderApp('/c/dev-1/k8s/all-namespaces/events');

    const nav = await openSidebar(user);
    const sections = within(nav)
      .getAllByRole('button')
      .filter((button) => !button.getAttribute('aria-label')?.endsWith('switch cluster'))
      .map((button) => button.textContent);
    expect(sections).toEqual(['Home', 'Favorites', 'Operators', 'Workloads', 'Networking', 'Storage', 'Compute', 'Administration']);
    await expandSection(user, nav, 'Home');
    const events = within(nav).getByRole('link', { name: 'Events' });
    expect(events).toHaveAttribute('href', '/c/dev-1/k8s/events');
    expect(events).toHaveAttribute('aria-current', 'page');
  });

  // OCP `NavSection.tsx`: every section starts collapsed, also the one holding the current page (T-0119).
  it('starts every section collapsed, marks the current one and targets the active cluster', async () => {
    const { user } = renderApp('/c/dev-1/k8s/ns/default/pods');

    const nav = await openSidebar(user);
    for (const title of ['Home', 'Favorites', 'Operators', 'Workloads', 'Networking', 'Storage', 'Compute', 'Administration']) {
      expect(within(nav).getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'false');
    }
    expect(within(nav).getByRole('button', { name: 'Workloads' }).closest('li')).toHaveClass('pf-m-current');
    await expandSection(user, nav, 'Workloads');
    expect(within(nav).getByRole('link', { name: 'Pods' })).toHaveAttribute('href', '/c/dev-1/k8s/pods');
    expect(within(nav).getByRole('link', { name: 'Pods' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'ConfigMaps' })).toBeVisible();
  });

  // ADR-0033 §5: the fleet perspective shows only its own sections, in the same Nav frame under the switcher.
  it.each(['admin', 'ines'])(
    'shows Fleet then Fleet administration on fleet pages to %s (FLT-1, FLEET-3)',
    async (username) => {
      setMockUser(username);
      const { user } = renderApp('/fleet/admin/users');

      const nav = await openSidebar(user);
      const toggle = await within(nav).findByRole('button', { name: 'Fleet management, switch cluster' });
      const buttons = within(nav).getAllByRole('button');
      expect(buttons[0]).toBe(toggle);
      expect(buttons.slice(1).map((button) => button.textContent)).toEqual(['Fleet', 'Fleet administration']);
      await expandSection(user, nav, 'Fleet');
      await expandSection(user, nav, 'Fleet administration');
      expect(
        within(nav)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['Overview', 'Users', 'Groups', 'Clusters', 'Credentials', 'Audit log']);
    },
  );

  it('shows only Fleet > Overview, marked current, on the fleet overview to a non-admin (FLT-1)', async () => {
    setMockUser('alice');
    const { user } = renderApp('/fleet/overview');

    expect(await screen.findByRole('heading', { name: 'Fleet overview', level: 1 })).toBeInTheDocument();
    const nav = await openSidebar(user);
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Fleet management', 'Fleet']);
    expect(within(nav).getByRole('button', { name: 'Fleet' }).closest('li')).toHaveClass('pf-m-current');
    await expandSection(user, nav, 'Fleet');
    const overview = within(nav).getByRole('link', { name: 'Overview' });
    expect(overview).toHaveAttribute('href', '/fleet/overview');
    expect(overview).toHaveAttribute('aria-current', 'page');
  });

  it('shows no Fleet administration on fleet pages to a non-admin (FLEET-8)', async () => {
    setMockUser('alice');
    const { user } = renderApp('/fleet/admin/users');

    expect(
      await screen.findByRole('heading', { name: "You don't have access to Fleet administration" }),
    ).toBeInTheDocument();
    const nav = await openSidebar(user);
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Fleet management', 'Fleet']);
  });

  it('switches cluster while keeping the current page', async () => {
    setMockUser('alice');
    const { user, router } = renderApp('/c/prod-eu-1/k8s/ns/default/pods');

    const nav = await openSidebar(user);
    await user.click(
      await within(nav).findByRole('button', {
        name: 'Cluster Production EU 1 (prod-eu-1, OCP, prod, read only), switch cluster',
      }),
    );
    await user.click(await screen.findByRole('option', { name: /staging-eu-1/ }));

    expect(router.state.location.pathname).toBe('/c/staging-eu-1/k8s/ns/default/pods');
    expect(
      await screen.findByRole('button', {
        name: 'Cluster Staging EU 1 (staging-eu-1, OCP, staging), switch cluster',
      }),
    ).toBeInTheDocument();
  });

  describe('Help › About', () => {
    it('shows the product name, version and environment from the Api', async () => {
      const { user } = renderApp('/c/dev-1/overview');
      await screen.findByRole('link', { name: 'Consolinho' });

      const about = await openAbout(user);
      expect(within(about).getByRole('heading', { name: 'Consolinho' })).toBeInTheDocument();
      expect(await within(about).findByText('0.0.0-test')).toBeInTheDocument();
      expect(within(about).getByText('Test')).toBeInTheDocument();

      await user.click(within(about).getByRole('button', { name: /close/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows a fallback when version information cannot be loaded', async () => {
      server.use(http.get('*/api/system/info', () => new HttpResponse(null, { status: 503 })));
      const { user } = renderApp('/c/dev-1/overview');
      await screen.findByRole('link', { name: 'Consolinho' });

      const about = await openAbout(user);
      expect(await within(about).findByText('Version information unavailable')).toBeInTheDocument();
    });
  });

  // UX.md §1: theme classes on <html> like OCP; the masthead theme menu is gone (User preferences, T-0120).
  describe('theme', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      document.documentElement.className = '';
    });

    it('uses the glass and felt themes and the light logo by default', async () => {
      renderApp('/c/dev-1/overview');

      expect(await screen.findByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.light);
      expect(document.documentElement).toHaveClass('pf-v6-theme-glass', 'pf-v6-theme-felt');
      expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
      expect(document.documentElement).not.toHaveClass('pf-v6-theme-high-contrast');
      expect(
        within(screen.getByRole('banner')).queryByRole('button', { name: 'Theme' }),
      ).not.toBeInTheDocument();
    });

    it('keeps a stored choice across reloads', async () => {
      localStorage.setItem('fleetconsole.theme', 'dark');
      renderApp('/c/dev-1/overview');

      expect(await screen.findByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.dark);
      expect(document.documentElement).toHaveClass('pf-v6-theme-dark');
    });

    it('follows the OS colour scheme live on System', async () => {
      const os = mockOsMedia({ dark: false });
      localStorage.setItem('fleetconsole.theme', 'system');
      renderApp('/c/dev-1/overview');
      expect(await screen.findByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.light);

      os.setDark(true);

      await waitFor(() => expect(document.documentElement).toHaveClass('pf-v6-theme-dark'));
      expect(screen.getByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.dark);
      expect(localStorage.getItem('fleetconsole.theme')).toBe('system');
    });

    it('switches glass to high contrast under prefers-contrast: more, live', async () => {
      const os = mockOsMedia({ moreContrast: true });
      renderApp('/c/dev-1/overview');
      await screen.findByRole('img', { name: 'Consolinho' });

      expect(document.documentElement).toHaveClass('pf-v6-theme-high-contrast', 'pf-v6-theme-felt');
      expect(document.documentElement).not.toHaveClass('pf-v6-theme-glass');

      os.setMoreContrast(false);

      await waitFor(() => expect(document.documentElement).toHaveClass('pf-v6-theme-glass'));
      expect(document.documentElement).not.toHaveClass('pf-v6-theme-high-contrast');
    });
  });

  describe('environment band (SW-10)', () => {
    it('marks a production cluster', async () => {
      setMockUser('alice');
      renderApp('/c/prod-eu-1/overview');

      expect(await screen.findByText('Production cluster prod-eu-1')).toBeInTheDocument();
    });

    it('marks a staging cluster', async () => {
      setMockUser('alice');
      renderApp('/c/staging-eu-1/overview');

      expect(await screen.findByText('Staging cluster staging-eu-1')).toBeInTheDocument();
    });

    it.each([
      ['a development cluster', 'admin', '/c/dev-1/overview'],
      ['an admin page', 'alice', '/fleet/admin/users'],
      // FLEET-9: the preferred cluster is production, but fleet pages are not about a cluster.
      ['a fleet page with a production preferred cluster', 'carol', '/fleet/admin/users'],
    ])('is absent on %s', async (_case, username, path) => {
      setMockUser(username);
      localStorage.setItem('fleetconsole.lastCluster', 'prod-eu-1');
      const { user } = renderApp(path);

      const nav = await openSidebar(user);
      await within(nav).findByRole('button', { name: /switch cluster$/ });
      expect(screen.queryByText(/^(Production|Staging) cluster /)).not.toBeInTheDocument();
    });
  });

  describe('cluster type theme', () => {
    /** The PF `Page` root, which carries the shell's cluster-type attribute. */
    const shell = () => screen.getByRole('main').closest('.pf-v6-c-page');

    it('marks the shell of a Kubernetes cluster (THEME-1)', async () => {
      setMockUser('alice');
      const { user } = renderApp('/c/lab-1/k8s/ns/default/pods');

      const nav = await openSidebar(user);
      const toggle = await within(nav).findByRole('button', {
        name: 'Cluster Lab 1 (lab-1, K8s, dev, read only), switch cluster',
      });
      expect(within(toggle).getByText('K8s')).toBeInTheDocument();
      expect(shell()).toHaveAttribute('data-cluster-type', 'kubernetes');
      // The navy masthead is dark in both themes, so it shows the dark-theme logo (light theme by default here).
      expect(screen.getByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.dark);
    });

    it.each([
      ['an OpenShift cluster', 'alice', '/c/prod-eu-1/k8s/ns/default/pods'],
      // FLEET-9: fleet pages are not about a cluster, even with a Kubernetes preferred cluster.
      ['a fleet page', 'admin', '/fleet/admin/users'],
    ])('leaves the shell neutral on %s', async (_case, username, path) => {
      setMockUser(username);
      localStorage.setItem('fleetconsole.lastCluster', 'lab-1');
      const { user } = renderApp(path);

      const nav = await openSidebar(user);
      await within(nav).findByRole('button', { name: /switch cluster$/ });
      expect(shell()).not.toHaveAttribute('data-cluster-type');
    });

    it('leaves the shell neutral on the not-available page', async () => {
      setMockUser('alice');
      localStorage.setItem('fleetconsole.lastCluster', 'lab-1');
      renderApp('/c/nope/overview');

      await screen.findByRole('heading', { name: 'Cluster nope is not available' });
      expect(shell()).not.toHaveAttribute('data-cluster-type');
    });

    it('leaves the shell neutral while the cluster list loads', async () => {
      server.use(
        http.get('*/api/clusters', async () => {
          await delay('infinite');
          return HttpResponse.json([]);
        }),
      );
      setMockUser('alice');
      const { user } = renderApp('/c/lab-1/k8s/ns/default/pods');

      const nav = await openSidebar(user);
      expect(await within(nav).findByRole('button', { name: 'Loading clusters' })).toBeDisabled();
      expect(shell()).not.toHaveAttribute('data-cluster-type');
    });

    it('follows a cluster switch without a reload (THEME-5)', async () => {
      setMockUser('alice');
      const { user, router } = renderApp('/c/lab-1/k8s/ns/default/pods');

      const nav = await openSidebar(user);
      await user.click(await within(nav).findByRole('button', { name: /^Cluster Lab 1 .*switch cluster$/ }));
      await user.click(await screen.findByRole('option', { name: /prod-eu-1/ }));
      await within(nav).findByRole('button', { name: /^Cluster Production EU 1 .*switch cluster$/ });
      expect(shell()).not.toHaveAttribute('data-cluster-type');

      await user.click(within(nav).getByRole('button', { name: /^Cluster Production EU 1 .*switch cluster$/ }));
      // lab-1 is listed under "Recent" and "All clusters"; either opens it.
      const [labOption] = await screen.findAllByRole('option', { name: /lab-1/ });
      if (!labOption) throw new Error('lab-1 is not listed');
      await user.click(labOption);
      expect(router.state.location.pathname).toBe('/c/lab-1/k8s/ns/default/pods');
      await waitFor(() => expect(shell()).toHaveAttribute('data-cluster-type', 'kubernetes'));
    });
  });
});
