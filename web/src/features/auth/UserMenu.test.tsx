import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { getMockUser, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('UserMenu (AUTH-9)', () => {
  it('shows display name with Admin and Read only badges for a read-only admin', async () => {
    setMockUser('ines');
    const { user } = renderApp('/c/prod-eu-1/overview');

    const toggle = await screen.findByRole('button', { name: 'Ines Auditor Admin Read only' });
    expect(within(toggle).getByText('Admin')).toBeInTheDocument();
    expect(within(toggle).getByText('Read only')).toBeInTheDocument();

    await user.click(toggle);
    const menu = await screen.findByRole('menu');
    expect(screen.getByText('ines')).toBeInTheDocument();
    expect(screen.getByText('1 group')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
  });

  it('shows only the name for a regular user', async () => {
    setMockUser('alice');
    renderApp('/c/prod-eu-1/overview');

    const toggle = await screen.findByRole('button', { name: 'Alice Example' });
    expect(within(toggle).queryByText('Admin')).not.toBeInTheDocument();
    expect(within(toggle).queryByText('Read only')).not.toBeInTheDocument();
  });

  it('falls back to the username without a display name', async () => {
    setMockUser('bob');
    const { user } = renderApp('/c/prod-eu-1/overview');

    await user.click(await screen.findByRole('button', { name: 'bob' }));
    expect(await screen.findByText('No groups')).toBeInTheDocument();
  });
});

describe('logout (AUTH-10)', () => {
  it('posts the logout with the CSRF header and lands on the logged-out login page', async () => {
    const csrfHeaders: (string | null)[] = [];
    server.use(
      http.post('*/api/auth/logout', ({ request }) => {
        csrfHeaders.push(request.headers.get('X-Console-Request'));
        return undefined; // fall through to the mock backend
      }),
    );
    const { user, router, queryClient } = renderApp('/admin/users');

    await user.click(await screen.findByRole('button', { name: 'Fleet Admin Admin' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(
      await screen.findByRole('heading', { name: 'Info alert:You have been logged out.' }),
    ).toBeInTheDocument();
    expect(csrfHeaders).toEqual(['1']);
    expect(getMockUser()).toBeNull();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?loggedOut=1');
    // No automatic OAuth redirect: the user has to click the button, which returns to the app root.
    expect(screen.getByRole('link', { name: 'Log in with OpenShift' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnUrl=%2F',
    );
    expect(queryClient.getQueryData(['api', 'auth', 'me'])).toBeUndefined();
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([['api', 'system', 'info']]);
  });

  it('stays signed in and reports a failed logout', async () => {
    server.use(
      http.post('*/api/auth/logout', () =>
        HttpResponse.json({ title: 'Error', detail: 'Try later.' }, { status: 500 }),
      ),
    );
    const { user, router } = renderApp('/c/prod-eu-1/overview');

    await user.click(await screen.findByRole('button', { name: 'Fleet Admin Admin' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(await screen.findByText('Could not log out')).toBeInTheDocument();
    expect(screen.getByText('Try later.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/prod-eu-1/overview');
  });
});
