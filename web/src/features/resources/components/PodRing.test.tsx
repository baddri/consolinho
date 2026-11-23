import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { http } from 'msw';
import { problem, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { resourceRoutes } from '../routes';
import { PodRing, SCALE_DEBOUNCE_MS, type PodRingScale } from './PodRing';

const UP = 'Increase the Pod count';
const DOWN = 'Decrease the Pod count';

/** A ring for a deployment wanting `desired` pods; no selector, so it lists no pods (and sends no requests). */
function renderRing(options: Omit<PodRingScale, 'allowed'>) {
  const scale = { ...options, allowed: true };
  const workload = { metadata: { namespace: 'shop' }, spec: { replicas: scale.desired } };
  return renderWithProviders(
    <PodRing cluster="dev-1" workload={workload} selector={undefined} scale={scale} />,
  );
}

describe('PodRing scale arrows (T-0184)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('DEP-5: three quick up-clicks show "Scaling to 5" at once and scale once, 1 s after the last click', () => {
    vi.useFakeTimers();
    const onScale = vi.fn(() => Promise.resolve());
    renderRing({ desired: 2, onScale });

    for (let click = 0; click < 3; click++) {
      fireEvent.click(screen.getByRole('button', { name: UP }));
      act(() => {
        vi.advanceTimersByTime(SCALE_DEBOUNCE_MS / 2);
      });
    }
    expect(screen.getByRole('img', { name: /Scaling to 5/ })).toBeInTheDocument();
    expect(onScale).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SCALE_DEBOUNCE_MS);
    });
    expect(onScale).toHaveBeenCalledTimes(1);
    expect(onScale).toHaveBeenCalledWith(5);
  });

  it('DEP-5: the down arrow is disabled at 0', () => {
    vi.useFakeTimers();
    const onScale = vi.fn(() => Promise.resolve());
    renderRing({ desired: 1, onScale });

    fireEvent.click(screen.getByRole('button', { name: DOWN }));
    expect(screen.getByRole('button', { name: DOWN })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(SCALE_DEBOUNCE_MS);
    });
    expect(onScale).toHaveBeenCalledWith(0);
  });

  it('DEP-5: without scale access the arrows are absent, not disabled', () => {
    renderWithProviders(
      <PodRing
        cluster="dev-1"
        workload={{ metadata: { namespace: 'shop' }, spec: { replicas: 2 } }}
        selector={undefined}
        scale={{ desired: 2, onScale: () => Promise.resolve(), allowed: false }}
      />,
    );

    expect(screen.getByRole('img', { name: /^0 Scaling to 2/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: UP })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: DOWN })).not.toBeInTheDocument();
  });

  it('unmounting during the debounce window still scales', () => {
    vi.useFakeTimers();
    const onScale = vi.fn(() => Promise.resolve());
    const { unmount } = renderRing({ desired: 2, onScale });

    fireEvent.click(screen.getByRole('button', { name: DOWN }));
    unmount();
    expect(onScale).toHaveBeenCalledTimes(1);
    expect(onScale).toHaveBeenCalledWith(1);
  });
});

describe('Deployment details ring (T-0184)', () => {
  const DETAILS = '/c/dev-1/k8s/ns/shop/deployments/web';

  beforeAll(() => preloadLazyRoutes(resourceRoutes));

  /** Records every PATCH the proxy receives: path and body. */
  function recordPatches(): { path: string; body: unknown }[] {
    const patches: { path: string; body: unknown }[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method !== 'PATCH') return;
      const path = new URL(request.url).pathname;
      void request
        .clone()
        .json()
        .then((body: unknown) => patches.push({ path, body }));
    });
    return patches;
  }

  /** The ring's up arrow, rendered once its access review allowed scaling. */
  function enabledUp(): Promise<HTMLElement> {
    return screen.findByRole('button', { name: UP }, { timeout: COLD_START_TIMEOUT_MS });
  }

  it(
    'DEP-5: three up-clicks send one …/scale PATCH with replicas + 3',
    async () => {
      const patches = recordPatches();
      const { user } = renderApp(DETAILS);

      const up = await enabledUp();
      await user.click(up);
      await user.click(up);
      await user.click(up);
      expect(screen.getByRole('img', { name: /Scaling to 6/ })).toBeInTheDocument();

      expect(
        await screen.findByText('web scaled to 6 on Development 1', {}, { timeout: 3000 }),
      ).toBeInTheDocument();
      expect(patches).toEqual([
        {
          path: expect.stringMatching(/\/namespaces\/shop\/deployments\/web\/scale$/) as unknown,
          body: [{ op: 'replace', path: '/spec/replicas', value: 6 }],
        },
      ]);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'DEP-5 RO: on a read-only grant the ring has no arrows (OCP isScalingAllowed)',
    async () => {
      setMockUser('alice');
      renderApp('/c/prod-eu-1/k8s/ns/shop/deployments/web');

      expect(
        await screen.findByRole('img', { name: /Pods/ }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
      // Long enough for the access review to have answered: the arrows must still be absent.
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(screen.queryByRole('button', { name: UP })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: DOWN })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'a failed scale (403) toasts and the ring shows the current count again',
    async () => {
      server.use(
        http.patch('*/api/clusters/:cluster/k8s/*', () =>
          problem(403, { code: 'Proxy.Forbidden', detail: 'deployments.apps "web" is forbidden' }),
        ),
      );
      const { user } = renderApp(DETAILS);

      const up = await enabledUp();
      await user.click(up);
      expect(screen.getByRole('img', { name: /Scaling to 4/ })).toBeInTheDocument();

      expect(await screen.findByText('Scale failed', {}, { timeout: 3000 })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.queryByRole('img', { name: /Scaling to 4/ })).not.toBeInTheDocument(),
      );
      expect(screen.getByRole('img', { name: /^3 Pods/ })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
