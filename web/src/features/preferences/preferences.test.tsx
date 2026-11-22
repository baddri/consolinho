import { screen, waitFor, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { expandSection, openSidebar } from '@/test/sidebar';
import { preferencesRoute } from './index';

const PODS_URL = '/c/dev-1/k8s/ns/default/pods';

describe('User preferences (T-0120)', () => {
  beforeAll(() => preloadLazyRoutes([preferencesRoute]));

  it(
    'opens the General tab with the OCP heading, help text and fields',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const { router } = renderApp('/user-preferences');

      expect(
        await screen.findByRole(
          'heading',
          { level: 1, name: 'User preferences' },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/user-preferences/general');
      expect(
        screen.getByText(
          'Set your individual preferences for the console experience. Any changes will be autosaved.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('button', { name: 'Color scheme' })).toHaveTextContent('System default');
      expect(screen.getByText('Console will appear as per the selected theme.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Contrast mode' })).toHaveTextContent('System default');
      expect(screen.getByText('Controls the contrast level of the console.')).toBeInTheDocument();
    },
  );

  it('applies and remembers the colour scheme and contrast mode at once', async () => {
    const { user } = renderApp('/user-preferences/general');

    await user.click(await screen.findByRole('button', { name: 'Color scheme' }));
    await user.click(await screen.findByRole('option', { name: 'Dark' }));
    await waitFor(() => expect(document.documentElement).toHaveClass('pf-v6-theme-dark'));
    expect(localStorage.getItem('fleetconsole.theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Color scheme' })).toHaveTextContent('Dark');

    await user.click(screen.getByRole('button', { name: 'Contrast mode' }));
    await user.click(await screen.findByRole('option', { name: /High contrast/ }));
    await waitFor(() => expect(document.documentElement).toHaveClass('pf-v6-theme-high-contrast'));
    expect(document.documentElement).not.toHaveClass('pf-v6-theme-glass');
    expect(localStorage.getItem('fleetconsole.contrast')).toBe('contrast');

    // Back to the defaults, so later tests start from glass + light.
    await user.click(screen.getByRole('button', { name: 'Contrast mode' }));
    await user.click(await screen.findByRole('option', { name: /System default/ }));
    await user.click(screen.getByRole('button', { name: 'Color scheme' }));
    await user.click(await screen.findByRole('option', { name: 'System default' }));
    await waitFor(() => expect(document.documentElement).toHaveClass('pf-v6-theme-glass'));
    expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
  });

  it('treats corrupt stored values as System default', async () => {
    localStorage.setItem('fleetconsole.theme', 'purple');
    localStorage.setItem('fleetconsole.contrast', '{"x":1}');
    renderApp('/user-preferences/general');

    expect(await screen.findByRole('button', { name: 'Color scheme' })).toHaveTextContent('System default');
    expect(screen.getByRole('button', { name: 'Contrast mode' })).toHaveTextContent('System default');
    expect(document.documentElement).toHaveClass('pf-v6-theme-glass');
    expect(document.documentElement).not.toHaveClass('pf-v6-theme-high-contrast');
    expect(document.documentElement).not.toHaveClass('pf-v6-theme-dark');
  });
});

describe('Favorites (T-0120)', () => {
  it('stars a list page under a name and lists it in the Favorites nav section', async () => {
    const { user, router } = renderApp(PODS_URL);

    const star = await screen.findByRole('button', { name: 'Add to favorites' });
    await user.click(star);
    const dialog = await screen.findByRole('dialog', { name: 'Add to favorites' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Pods dev-1');

    await user.clear(name);
    await user.type(name, 'My pods!');
    expect(
      await within(dialog).findByText('Name can only contain letters, numbers, spaces, and hyphens.'),
    ).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'My pods');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(JSON.parse(localStorage.getItem('fleetconsole.favorites.admin') ?? '[]')).toEqual([
      { name: 'My pods', url: PODS_URL },
    ]);

    // On the starred page the section is expanded and current (OCP `FavoriteNavItems`).
    const nav = await openSidebar(user);
    const link = within(nav).getByRole('link', { name: /My pods/ });
    expect(link).toHaveAttribute('href', PODS_URL);
    expect(link).toHaveAttribute('aria-current', 'page');

    await user.click(within(nav).getByRole('button', { name: 'Unfavorite My pods' }));
    expect(router.state.location.pathname).toBe(PODS_URL);
    expect(await within(nav).findByText('No favorites added')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to favorites' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('rejects a duplicate name and un-stars from the heading', async () => {
    setMockUser('alice');
    localStorage.setItem(
      'fleetconsole.favorites.alice',
      JSON.stringify([{ name: 'Pods', url: '/c/x/k8s/pods' }]),
    );
    const { user } = renderApp('/c/prod-eu-1/k8s/ns/default/pods');

    await user.click(await screen.findByRole('button', { name: 'Add to favorites' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add to favorites' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Pods');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText(
        'The name Pods already exists in your favorites. Choose a unique name to save to your favorites.',
      ),
    ).toBeInTheDocument();

    await user.clear(name);
    await user.type(name, 'EU pods');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await user.click(await screen.findByRole('button', { name: 'Remove from favorites' }));

    const nav = await openSidebar(user);
    await expandSection(user, nav, 'Favorites');
    expect(within(nav).getByRole('link', { name: /Pods/ })).toHaveAttribute('href', '/c/x/k8s/pods');
    expect(within(nav).queryByRole('link', { name: /EU pods/ })).not.toBeInTheDocument();
  });

  it('ignores corrupt stored favourites', async () => {
    localStorage.setItem(
      'fleetconsole.favorites.admin',
      JSON.stringify([{ name: 'Good', url: '/c/dev-1/k8s/pods' }, { name: 3 }, 'junk', null]),
    );
    const { user } = renderApp(PODS_URL);

    const nav = await openSidebar(user);
    await expandSection(user, nav, 'Favorites');
    expect(within(nav).getByRole('link', { name: /Good/ })).toHaveAttribute('href', '/c/dev-1/k8s/pods');
    // Malformed entries are dropped; the other sections are collapsed, so this is the only visible link.
    expect(within(nav).getAllByRole('link')).toHaveLength(1);

    localStorage.setItem('fleetconsole.favorites.admin', '{not json');
    // A write from another tab: `useStoredValue` re-reads on the `storage` event.
    window.dispatchEvent(new StorageEvent('storage'));
    expect(await within(nav).findByText('No favorites added')).toBeInTheDocument();
  });
});
