import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS } from '@/test/coldStart';
import { credentialIds, mockDb, setMockUser } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockViewportWidth } from '@/test/viewport';

const HELPER = "You can't list namespaces on this cluster. Showing the namespaces configured for your access.";

beforeEach(() => {
  mockViewportWidth(1440);
  setMockUser('alice');
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** Records the namespace list and watch GETs (`/api/v1/namespaces`, not a single namespace). */
function recordNamespaceLists(): URL[] {
  const requests: URL[] = [];
  server.use(
    http.get('*/api/clusters/:cluster/k8s/api/v1/namespaces', ({ request }) => {
      requests.push(new URL(request.url));
      return undefined;
    }),
  );
  return requests;
}

/** Answers every access review with `allowed: true`, so only the list's own 403 can trigger the fallback. */
function allowAccessReviews(): void {
  server.use(
    http.post('*/api/clusters/:cluster/k8s/apis/authorization.k8s.io/v1/selfsubjectaccessreviews', () =>
      HttpResponse.json({
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SelfSubjectAccessReview',
        spec: {},
        status: { allowed: true },
      }),
    ),
  );
}

/** Opens the selector and returns its list box. */
async function openSelector(user: UserEvent, toggle: string): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: toggle }, { timeout: COLD_START_TIMEOUT_MS }));
  return screen.findByRole('listbox', { name: 'Namespaces' });
}

const optionNames = (list: HTMLElement) =>
  within(list)
    .queryAllByRole('option')
    .map((option) => option.textContent);

const searchBox = () => screen.getByRole('textbox', { name: 'Search namespaces' });

describe('namespace selector fallback (NSF-1/2/5)', () => {
  it(
    'lists the configured namespaces without requesting the namespace list when the review says no (NSF-1)',
    { timeout: COLD_START_TEST_TIMEOUT_MS },
    async () => {
      const requests = recordNamespaceLists();
      const { user } = renderApp('/c/dev-k8s-ns/k8s/ns/team-a/pods');

      const list = await openSelector(user, 'Namespace: team-a');
      expect(await screen.findByText(HELPER)).toBeInTheDocument();
      expect(optionNames(list)).toEqual(['team-a']);
      expect(screen.queryByText(/enter a namespace name/)).not.toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(requests).toEqual([]);
    },
  );

  it('falls back the same way when the review allows but the list answers 403 (NSF-1)', async () => {
    allowAccessReviews();
    const requests = recordNamespaceLists();
    const { user } = renderApp('/c/dev-k8s-ns/k8s/ns/team-a/pods');

    const list = await openSelector(user, 'Namespace: team-a');
    expect(await screen.findByText(HELPER)).toBeInTheDocument();
    expect(optionNames(list)).toEqual(['team-a']);
    expect(requests.length).toBeGreaterThan(0);
  });

  it('offers "Go to namespace" for a valid typed name and never "All namespaces" (NSF-2)', async () => {
    const { user, router } = renderApp('/c/dev-k8s-ns/k8s/all-namespaces/pods');

    // The review runs when the menu opens (T-0370); the toggle then drops the "All namespaces" wording.
    const list = await openSelector(user, 'Namespace: All namespaces');
    await screen.findByText(HELPER);
    expect(optionNames(list)).toEqual(['team-a']);
    expect(screen.getByRole('button', { name: 'Namespace: Select a namespace' })).toBeInTheDocument();

    await user.type(searchBox(), 'team-a');
    expect(optionNames(list)).toEqual(['team-a']);

    await user.clear(searchBox());
    await user.type(searchBox(), 'Bad_Name');
    expect(optionNames(list).some((name) => name.startsWith('Go to'))).toBe(false);
    await user.keyboard('{Enter}');
    expect(screen.getByText(/Use lowercase letters, digits and '-'/)).toBeInTheDocument();

    await user.clear(searchBox());
    await user.type(searchBox(), 'team-b');
    expect(optionNames(list)[0]).toBe('Go to namespace "team-b"');
    await user.click(within(list).getByRole('option', { name: 'Go to namespace "team-b"' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-k8s-ns/k8s/ns/team-b/pods'));
  });

  it('chooses the typed name on Enter (NSF-2)', async () => {
    const { user, router } = renderApp('/c/dev-k8s-ns/k8s/ns/team-a/pods');

    await openSelector(user, 'Namespace: team-a');
    await user.type(searchBox(), 'team-c{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/dev-k8s-ns/k8s/ns/team-c/pods'));
  });

  it('shows only the helper text and the Go-to item when no namespaces are configured', async () => {
    const credential = mockDb.credentials.find((entry) => entry.id === credentialIds.devK8sNsTeamA);
    if (!credential) throw new Error('fixture credential missing');
    credential.inspectNamespaces = [];
    const { user } = renderApp('/c/dev-k8s-ns/k8s/all-namespaces/pods');

    const list = await openSelector(user, 'Namespace: All namespaces');
    expect(await screen.findByText(HELPER)).toBeInTheDocument();
    expect(optionNames(list)).toEqual([]);

    await user.type(searchBox(), 'team-b');
    expect(optionNames(list)).toEqual(['Go to namespace "team-b"']);
  });

  it('keeps the forbidden list state for a list that 403s inside a chosen namespace (NSF-5)', async () => {
    renderApp('/c/dev-k8s-ns/k8s/ns/shop/pods');

    expect(
      await screen.findByText(/can't list pods in shop/, undefined, { timeout: COLD_START_TIMEOUT_MS }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Namespace: shop' })).toBeInTheDocument();
  });
});
