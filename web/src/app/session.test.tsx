import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter } from 'react-router';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS } from '@/test/coldStart';
import { problem, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { createQueryClient } from './queryClient';
import { handleUnauthenticated } from './session';

const ME_KEY = ['api', 'auth', 'me'];

/** Counts `GET /api/auth/me` requests without answering them (the mock backend still does). */
function spyOnMe() {
  const spy = vi.fn();
  server.use(
    http.get('*/api/auth/me', () => {
      spy();
      return undefined;
    }),
  );
  return spy;
}

const unauthenticated = () =>
  problem(401, { code: 'Auth.Unauthenticated', detail: 'Authentication required.' });

describe('session handling (ADR-0014)', () => {
  // First full-app render of the file: its first wait gets the documented cold-start allowance (T-0046).
  it(
    'sends a visitor without a session to /login with the deep link as return URL, without a loop (AUTH-1/12)',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      setMockUser(null);
      const meCalls = spyOnMe();
      const { router } = renderApp('/c/prod-eu-1/ns/default/pods?x=1');

      const login = await screen.findByRole(
        'link',
        { name: 'Log in with OpenShift' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(login).toHaveAttribute(
        'href',
        '/api/auth/login?returnUrl=%2Fc%2Fprod-eu-1%2Fns%2Fdefault%2Fpods%3Fx%3D1',
      );
      expect(router.state.location.pathname).toBe('/login');
      // A first visit is not an ended session: no "session ended" message.
      expect(router.state.location.search).not.toContain('reason');
      expect(screen.queryByRole('heading', { name: /alert:/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Global' })).not.toBeInTheDocument();

      // Only the session guard asked `me`; the login page never does, so it cannot loop.
      await screen.findByText(/^Consolinho 0\.0\.0-test/);
      expect(meCalls).toHaveBeenCalledTimes(1);
    },
  );

  it('shows a spinner while the session loads', async () => {
    renderApp('/c/dev-1/overview');

    expect(screen.getByRole('progressbar', { name: 'Loading session' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
  });

  it('shows an error with Retry when the session cannot be loaded for another reason', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ title: 'Oops', detail: 'Database down.' }, { status: 503 }),
      ),
    );
    const { user, router } = renderApp('/c/dev-1/overview');

    expect(await screen.findByText('Database down.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/c/dev-1/overview');

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Overview', level: 1 })).toBeInTheDocument();
  });

  it('ends the session on a later 401 from any query: session-ended message, cache cleared (AUTH-11)', async () => {
    const { router, queryClient } = renderApp('/c/dev-1/k8s/ns/default/pods?x=1#top');
    await screen.findByRole('heading', { name: 'Pods', level: 1 });
    expect(queryClient.getQueryData(ME_KEY)).toBeDefined();

    // Not `me`: any Api call answering 401 means the session is gone (the cluster list is always observed by the shell).
    server.use(http.get('*/api/clusters', unauthenticated));
    await act(() => queryClient.refetchQueries({ queryKey: ['api', 'clusters'] }));

    expect(
      await screen.findByRole('heading', {
        name: 'Warning alert:Your session ended. Log in again to continue.',
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get('reason')).toBe('session_ended');
    expect(params.get('returnUrl')).toBe('/c/dev-1/k8s/ns/default/pods?x=1#top');
    expect(screen.getByRole('link', { name: 'Log in with OpenShift' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnUrl=%2Fc%2Fdev-1%2Fk8s%2Fns%2Fdefault%2Fpods%3Fx%3D1%23top',
    );

    // Nothing of the ended session survives: only the anonymous system/info query the login footer observes is left.
    await waitFor(() => expect(queryClient.getQueryData(ME_KEY)).toBeUndefined());
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([['api', 'system', 'info']]);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
    expect(router.state.location.pathname).toBe('/login');
  });
});

describe('handleUnauthenticated', () => {
  it('does nothing on the login page (loop guard)', () => {
    const router = createMemoryRouter([{ path: '*', element: null }], {
      initialEntries: ['/login?error=failed'],
    });
    const navigate = vi.spyOn(router, 'navigate');
    const queryClient = createQueryClient();
    queryClient.setQueryData(ME_KEY, { username: 'admin' });

    handleUnauthenticated(router, queryClient);

    expect(navigate).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(ME_KEY)).toBeDefined();
  });

  it('redirects only once when several requests fail together', async () => {
    const router = createMemoryRouter([{ path: '*', element: null }], { initialEntries: ['/admin/users'] });
    const navigate = vi.spyOn(router, 'navigate');
    const queryClient = createQueryClient();
    queryClient.setQueryData(ME_KEY, { username: 'admin' });

    handleUnauthenticated(router, queryClient);
    handleUnauthenticated(router, queryClient);

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?returnUrl=%2Fadmin%2Fusers&reason=session_ended');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });
});
