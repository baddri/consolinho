import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
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
        await screen.findByRole('link', { name: 'FleetConsole' }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'Cluster dev-1 (dev), switch cluster' }),
      ).toHaveTextContent('dev');
      expect(screen.getByRole('button', { name: 'Light theme' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fleet Admin Admin' })).toBeInTheDocument();
    },
  );

  it('renders OCP-like navigation sections and an admin section', async () => {
    const { user } = renderApp('/c/dev-1/overview');

    const nav = await openSidebar(user);
    for (const section of [
      'Home',
      'Workloads',
      'Networking',
      'Storage',
      'Compute',
      'Administration',
      'Fleet administration',
    ]) {
      expect(within(nav).getByRole('button', { name: section })).toBeInTheDocument();
    }
    const overview = within(nav).getByRole('link', { name: 'Overview' });
    expect(overview).toHaveAttribute('href', '/c/dev-1/overview');
    expect(overview).toHaveAttribute('aria-current', 'page');
  });

  it('expands the section of the current page and targets the active cluster', async () => {
    const { user } = renderApp('/c/dev-1/ns/default/pods');

    const nav = await openSidebar(user);
    expect(within(nav).getByRole('link', { name: 'Pods' })).toHaveAttribute('href', '/c/dev-1/ns/all/pods');
    expect(within(nav).getByRole('link', { name: 'Deployments' })).toBeVisible();
  });

  it('switches cluster while keeping the current page', async () => {
    setMockUser('alice');
    const { user, router } = renderApp('/c/prod-eu-1/ns/default/pods');

    await user.click(
      await screen.findByRole('button', { name: 'Cluster prod-eu-1 (prod, read only), switch cluster' }),
    );
    await user.click(await screen.findByRole('option', { name: /staging-eu-1/ }));

    expect(router.state.location.pathname).toBe('/c/staging-eu-1/ns/default/pods');
    expect(
      await screen.findByRole('button', { name: 'Cluster staging-eu-1 (staging), switch cluster' }),
    ).toBeInTheDocument();
  });

  it('shows the FleetConsole version from the Api', async () => {
    const { user } = renderApp('/c/dev-1/overview');
    await openSidebar(user);

    // `getByText` matches own text nodes only: the footer's are "FleetConsole · Test" (the version is a child
    // element), and the `·` keeps the masthead logo ("FleetConsole") from matching too.
    const footer = await screen.findByText(/^FleetConsole ·/);
    expect(footer).toBeVisible();
    expect(footer).toHaveTextContent('FleetConsole 0.0.0-test · Test');
  });

  it('shows a fallback when version information cannot be loaded', async () => {
    server.use(http.get('*/api/system/info', () => new HttpResponse(null, { status: 503 })));
    renderApp('/c/dev-1/overview');

    expect(await screen.findByText('Version information unavailable')).toBeInTheDocument();
  });

  it('toggles the dark theme', async () => {
    const { user } = renderApp('/c/dev-1/overview');

    await user.click(await screen.findByRole('button', { name: 'Dark theme' }));

    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('fleetconsole.theme')).toBe('dark');
  });
});
