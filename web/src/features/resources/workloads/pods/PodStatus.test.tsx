import { screen, within } from '@testing-library/react';
import type { K8sResource, Pod } from '@/shared/k8s';
import { renderWithProviders } from '@/test/render';
import { PodStatus } from './PodStatus';

const POD = 'web-7d4b9c8f6d-tq5wn';
const POD_PATH = `/c/dev-1/k8s/ns/shop/pods/${POD}`;

type ContainerState = NonNullable<NonNullable<Pod['status']>['containerStatuses']>[number]['state'];

/** A one-container (`web`) pod in `shop` whose container is in `state`. */
function pod(phase: string, state: ContainerState): Pod & K8sResource {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: POD, namespace: 'shop' },
    spec: { containers: [{ name: 'web', image: 'quay.io/example/web:1.4.2' }] },
    status: {
      phase,
      containerStatuses: [
        { name: 'web', image: 'quay.io/example/web:1.4.2', imageID: '', ready: false, restartCount: 4, state },
      ],
    },
  };
}

function renderStatus(obj: Pod & K8sResource) {
  return renderWithProviders(<PodStatus pod={obj} />, { path: '/c/:cluster/*', url: '/c/dev-1/k8s/ns/shop/pods' });
}

describe('PodStatus (OCP pod status popover, DEP-2)', () => {
  it('DEP-2: CrashLoopBackOff opens a popover with the reason and links to the container logs and the events', async () => {
    const { user, router } = renderStatus(
      pod('Running', {
        waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m0s restarting failed container=web' },
      }),
    );

    await user.click(screen.getByRole('button', { name: /CrashLoopBackOff/ }));
    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByText('Pod crash loop backoff')).toBeInTheDocument();
    expect(within(popover).getByText(/back-off 5m0s restarting failed container=web/)).toBeInTheDocument();
    expect(within(popover).getByRole('link', { name: 'View events' })).toHaveAttribute('href', `${POD_PATH}/events`);

    await user.click(within(popover).getByRole('link', { name: 'View logs' }));
    expect(router.state.location.pathname).toBe(`${POD_PATH}/logs`);
    expect(router.state.location.search).toBe('?container=web');
  });

  it('ErrImagePull shows the waiting message without links, as OCP', async () => {
    const { user } = renderStatus(
      pod('Pending', { waiting: { reason: 'ErrImagePull', message: 'manifest unknown' } }),
    );

    await user.click(screen.getByRole('button', { name: /ErrImagePull/ }));
    const popover = await screen.findByRole('dialog');
    expect(within(popover).getByText('manifest unknown')).toBeInTheDocument();
    expect(within(popover).queryByRole('link')).not.toBeInTheDocument();
  });

  it('keeps a healthy status as plain icon + text', () => {
    renderStatus(pod('Running', { running: { startedAt: '2026-11-23T10:00:00Z' } }));

    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
