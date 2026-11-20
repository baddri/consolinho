import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { LOGO_SRC } from '@/shared/branding';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS } from '@/test/coldStart';
import { setMockUser } from '@/test/handlers';
import { server } from '@/test/server';
import { renderApp } from '@/test/render';

/**
 * jsdom has no layout (width 0), so PatternFly treats the page as mobile and starts with the sidebar closed.
 * Open it the way a user would before querying the navigation.
 */
async function openSidebar(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Global navigation' }));
  return screen.findByRole('navigation', { name: 'Global' });
}

describe('AppShell', () => {
  // First full-app render of the file: its first wait gets the documented cold-start allowance (T-0046).
  it(
    'renders the masthead with brand, cluster switcher, theme toggle and user menu',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      renderApp('/c/dev-1/overview');

      expect(
        await screen.findByRole('link', { name: 'Consolinho' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toHaveAttribute('href', '/');
      expect(
        await screen.findByRole('button', { name: 'Cluster dev-1 (dev), switch cluster' }),
      ).toHaveTextContent('dev');
      expect(screen.getByRole('button', { name: 'Light theme' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fleet Admin Admin' })).toBeInTheDocument();
    },
  );

  // Sections come from the registry (T-0073): only sections with registered kinds are listed, admin last (SW-11).
  it('renders registry-driven navigation sections and an admin section', async () => {
    const { user } = renderApp('/c/dev-1/k8s/all-namespaces/events');

    const nav = await openSidebar(user);
    const sections = within(nav)
      .getAllByRole('button')
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

    await user.click(
      await screen.findByRole('button', { name: 'Cluster prod-eu-1 (prod, read only), switch cluster' }),
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

  it('toggles the dark theme and switches to the light-on-dark logo', async () => {
    const { user } = renderApp('/c/dev-1/overview');
    expect(await screen.findByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.light);

    await user.click(await screen.findByRole('button', { name: 'Dark theme' }));

    expect(screen.getByRole('img', { name: 'Consolinho' })).toHaveAttribute('src', LOGO_SRC.dark);

    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('fleetconsole.theme')).toBe('dark');
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
      renderApp(path);

      await screen.findByRole('button', { name: /switch cluster|Select a cluster/ });
      expect(screen.queryByText(/^(Production|Staging) cluster /)).not.toBeInTheDocument();
    });
  });
});
