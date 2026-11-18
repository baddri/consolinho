import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
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
  it('renders the masthead with brand, cluster switcher, theme toggle and user menu', async () => {
    renderApp('/c/prod-eu-1/overview');

    expect(await screen.findByRole('link', { name: 'FleetConsole' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cluster prod-eu-1, switch cluster' })).toHaveTextContent(
      'prod',
    );
    expect(screen.getByRole('button', { name: 'Light theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument();
  });

  it('renders OCP-like navigation sections and an admin section', async () => {
    const { user } = renderApp('/c/prod-eu-1/overview');

    const nav = await openSidebar(user);
    for (const section of [
      'Home',
      'Workloads',
      'Networking',
      'Storage',
      'Compute',
      'Administration',
      'Admin',
    ]) {
      expect(within(nav).getByRole('button', { name: section })).toBeInTheDocument();
    }
    const overview = within(nav).getByRole('link', { name: 'Overview' });
    expect(overview).toHaveAttribute('href', '/c/prod-eu-1/overview');
    expect(overview).toHaveAttribute('aria-current', 'page');
  });

  it('expands the section of the current page and targets the active cluster', async () => {
    const { user } = renderApp('/c/dev-1/ns/default/pods');

    const nav = await openSidebar(user);
    expect(within(nav).getByRole('link', { name: 'Pods' })).toHaveAttribute('href', '/c/dev-1/ns/all/pods');
    expect(within(nav).getByRole('link', { name: 'Deployments' })).toBeVisible();
  });

  it('switches cluster while keeping the current page', async () => {
    const { user, router } = renderApp('/c/prod-eu-1/ns/default/pods');

    await user.click(await screen.findByRole('button', { name: 'Cluster prod-eu-1, switch cluster' }));
    await user.click(await screen.findByRole('option', { name: /staging-eu-1/ }));

    expect(router.state.location.pathname).toBe('/c/staging-eu-1/ns/default/pods');
    expect(
      await screen.findByRole('button', { name: 'Cluster staging-eu-1, switch cluster' }),
    ).toBeInTheDocument();
  });

  it('shows the FleetConsole version from the Api', async () => {
    const { user } = renderApp('/c/prod-eu-1/overview');
    await openSidebar(user);

    expect(await screen.findByText('FleetConsole 0.0.0-test · Test')).toBeVisible();
  });

  it('shows a fallback when version information cannot be loaded', async () => {
    server.use(http.get('*/api/system/info', () => new HttpResponse(null, { status: 503 })));
    renderApp('/c/prod-eu-1/overview');

    expect(await screen.findByText('Version information unavailable')).toBeInTheDocument();
  });

  it('toggles the dark theme', async () => {
    const { user } = renderApp('/c/prod-eu-1/overview');

    await user.click(await screen.findByRole('button', { name: 'Dark theme' }));

    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('fleetconsole.theme')).toBe('dark');
  });
});
