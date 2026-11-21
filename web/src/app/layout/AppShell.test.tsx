import { act, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { LOGO_SRC } from '@/shared/branding';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS } from '@/test/coldStart';
import { setMockUser } from '@/test/handlers';
import { server } from '@/test/server';
import { openSidebar } from '@/test/sidebar';
import { renderApp } from '@/test/render';

/**
 * Fakes `matchMedia('(prefers-color-scheme: dark)')` (jsdom has none). Call before rendering; `setDark` flips the
 * OS setting and fires `change` like a browser does.
 */
function mockOsDarkMode(initiallyDark: boolean) {
  let matches = initiallyDark;
  const listeners = new Set<() => void>();
  const query = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return {
    setDark(dark: boolean) {
      matches = dark;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

/** Opens the masthead theme menu and returns its options. */
async function openThemeMenu(user: UserEvent) {
  await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Theme' }));
  return within(await screen.findByRole('listbox', { name: 'Theme' })).getAllByRole('option');
}

describe('AppShell', () => {
  // First full-app render of the file: its first wait gets the documented cold-start allowance (T-0046).
  it(
    'renders a masthead with only brand, theme menu and user menu, and the cluster switcher atop the sidebar',
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
      expect(mastheadButtons).toEqual(['Global navigation', 'Theme', expect.stringMatching(/Fleet Admin/)]);

      const nav = await openSidebar(user);
      const toggle = await within(nav).findByRole('button', { name: 'Cluster dev-1 (dev), switch cluster' });
      expect(toggle).toHaveTextContent('dev');
      // First child of the nav, before the sections (UX.md §2).
      expect(within(nav).getAllByRole('button')[0]).toBe(toggle);
    },
  );

  // Sections come from the registry (T-0073): only sections with registered kinds are listed, admin last (SW-11).
  it('renders registry-driven navigation sections and an admin section', async () => {
    const { user } = renderApp('/c/dev-1/k8s/all-namespaces/events');

    const nav = await openSidebar(user);
    const sections = within(nav)
      .getAllByRole('button')
      .filter((button) => !button.getAttribute('aria-label')?.endsWith('switch cluster'))
      .map((button) => button.textContent);
    expect(sections).toEqual(['Home', 'Workloads', 'Networking', 'Administration', 'Fleet administration']);
    const events = within(nav).getByRole('link', { name: 'Events' });
    expect(events).toHaveAttribute('href', '/c/dev-1/k8s/events');
    expect(events).toHaveAttribute('aria-current', 'page');
  });

  it('expands the section of the current page and targets the active cluster', async () => {
    const { user } = renderApp('/c/dev-1/k8s/ns/default/pods');

    const nav = await openSidebar(user);
    expect(within(nav).getByRole('link', { name: 'Pods' })).toHaveAttribute('href', '/c/dev-1/k8s/pods');
    expect(within(nav).getByRole('link', { name: 'Pods' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'ConfigMaps' })).toBeVisible();
  });

  it('switches cluster while keeping the current page', async () => {
    setMockUser('alice');
    const { user, router } = renderApp('/c/prod-eu-1/k8s/ns/default/pods');

    const nav = await openSidebar(user);
    await user.click(
      await within(nav).findByRole('button', { name: 'Cluster prod-eu-1 (prod, read only), switch cluster' }),
    );
    await user.click(await screen.findByRole('option', { name: /staging-eu-1/ }));

    expect(router.state.location.pathname).toBe('/c/staging-eu-1/k8s/ns/default/pods');
    expect(
      await screen.findByRole('button', { name: 'Cluster staging-eu-1 (staging), switch cluster' }),
    ).toBeInTheDocument();
  });

  it('shows the Consolinho version from the Api', async () => {
    const { user } = renderApp('/c/dev-1/overview');
    await openSidebar(user);

    // `getByText` matches own text nodes only: the footer's are "Consolinho · Test" (the version is a child
    // element), and the `·` keeps the masthead logo ("Consolinho") from matching too.
    const footer = await screen.findByText(/^Consolinho ·/);
    expect(footer).toBeVisible();
    expect(footer).toHaveTextContent('Consolinho 0.0.0-test · Test');
  });

  it('shows a fallback when version information cannot be loaded', async () => {
    server.use(http.get('*/api/system/info', () => new HttpResponse(null, { status: 503 })));
    renderApp('/c/dev-1/overview');

    expect(await screen.findByText('Version information unavailable')).toBeInTheDocument();
  });

  describe('theme menu', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('switches to dark, marks the choice and switches to the light-on-dark logo', async () => {
      const { user } = renderApp('/c/dev-1/overview');
      expect(await screen.findByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.light);

      const options = await openThemeMenu(user);
      expect(options.map((option) => option.textContent)).toEqual(['Light', 'Dark', 'System']);
      // No stored choice: System.
      expect(screen.getByRole('option', { name: 'System' })).toHaveAttribute('aria-selected', 'true');
      await user.click(screen.getByRole('option', { name: 'Dark' }));

      expect(screen.getByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.dark);
      expect(document.documentElement).toHaveClass('pf-v6-theme-dark');
      expect(localStorage.getItem('fleetconsole.theme')).toBe('dark');
      await openThemeMenu(user);
      expect(screen.getByRole('option', { name: 'Dark' })).toHaveAttribute('aria-selected', 'true');
    });

    it('keeps a stored choice across reloads', async () => {
      localStorage.setItem('fleetconsole.theme', 'dark');
      renderApp('/c/dev-1/overview');

      expect(await screen.findByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.dark);
    });

    it('follows the OS setting live on System', async () => {
      const os = mockOsDarkMode(false);
      localStorage.setItem('fleetconsole.theme', 'system');
      renderApp('/c/dev-1/overview');
      expect(await screen.findByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.light);

      os.setDark(true);

      await waitFor(() => expect(document.documentElement).toHaveClass('pf-v6-theme-dark'));
      expect(screen.getByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.dark);
      expect(localStorage.getItem('fleetconsole.theme')).toBe('system');
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
      ['an admin page', 'alice', '/admin/users'],
    ])('is absent on %s', async (_case, username, path) => {
      setMockUser(username);
      const { user } = renderApp(path);

      const nav = await openSidebar(user);
      await within(nav).findByRole('button', { name: /switch cluster$/ });
      expect(screen.queryByText(/^(Production|Staging) cluster /)).not.toBeInTheDocument();
    });
  });
});
