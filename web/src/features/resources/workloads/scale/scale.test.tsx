import { screen, waitFor, within } from '@testing-library/react';
import {
  DeploymentModel,
  JobModel,
  StatefulSetModel,
  setWatchTimingForTests,
  type K8sModel,
  type K8sResource,
} from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { ResourceRowActions } from '../../actions/ResourceRowActions';
import { deploymentDescriptor } from '../../registry/kinds/deployments';
import { statefulSetDescriptor, type StatefulSetResource } from '../../registry/kinds/statefulsets';
import type { KindActionArgs, KindActions } from '../../registry/types';
import { resourceRoutes } from '../../routes';
import { ConfigureCountModal, type CountedWorkload } from './ConfigureCountModal';
import { useEditCountAction } from './useEditCountAction';
import { useRestartAction } from './useRestartRollout';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});
afterEach(() => server.events.removeAllListeners()); // recordPatches / request spies register per test

/** `name` of `model` in `shop` on `dev-1`, as the mock stores it. */
function stored(model: K8sModel, name: string): K8sResource {
  const obj = mockK8s.get('dev-1', model, 'shop', name);
  if (!obj) throw new Error(`fixture ${model.kind} ${name} missing`);
  return obj;
}

/** Records method, path and body of every PATCH the proxy receives. */
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

/** StatefulSet actions built only from the shared scale items, as T-0192 will. */
function useStatefulSetScaleActions(args: KindActionArgs<StatefulSetResource>): KindActions {
  const count = useEditCountAction(args, StatefulSetModel);
  const restart = useRestartAction(args, StatefulSetModel);
  return { items: [...(count.item ? [count.item] : []), restart], dialog: count.dialog };
}

describe('shared scale actions (T-0190)', () => {
  it(
    'HPA-1: an autoscaled Deployment shows "Autoscaled to 2 Pods", no arrows and no Edit Pod count',
    async () => {
      const { user } = renderApp('/c/dev-1/k8s/ns/shop/deployments/worker');

      expect(
        await screen.findByRole('img', { name: /^Autoscaled to 2 Pods/ }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Actions' }));
      const pause = screen.getByRole('menuitem', { name: 'Pause rollouts' });
      await waitFor(() => expect(pause).not.toHaveAttribute('aria-disabled', 'true'));
      expect(screen.queryByRole('menuitem', { name: 'Edit Pod count' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Increase the Pod count' })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'HPA-1: a Deployment without an HPA (web) keeps its arrows and Edit Pod count',
    async () => {
      const { user } = renderApp('/c/dev-1/k8s/ns/shop/deployments/web');

      expect(
        await screen.findByRole(
          'button',
          { name: 'Increase the Pod count' },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: /Autoscal/ })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Actions' }));
      expect(screen.getByRole('menuitem', { name: 'Edit Pod count' })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('a list-row kebab on an autoscaled Deployment opens no HPA watch and keeps Edit Pod count', async () => {
    const hpaRequests: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.includes('/horizontalpodautoscalers')) hpaRequests.push(request.url);
    });
    const { user } = renderWithProviders(
      <ResourceRowActions
        cluster="dev-1"
        descriptor={deploymentDescriptor}
        obj={stored(DeploymentModel, 'worker')}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Kebab toggle' }));
    const count = await screen.findByRole('menuitem', { name: 'Edit Pod count' });
    await waitFor(() => expect(count).not.toHaveAttribute('aria-disabled', 'true'));
    expect(hpaRequests).toEqual([]);
  });

  it('Edit parallelism sends one replace /spec/parallelism PATCH', async () => {
    const job = stored(JobModel, 'migrate-db') as CountedWorkload;
    const patches = recordPatches();
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <ConfigureCountModal
        cluster="dev-1"
        model={JobModel}
        obj={job}
        field="parallelism"
        onClose={onClose}
      />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Edit parallelism' });
    expect(dialog).toHaveAccessibleDescription(
      'Jobs create one or more pods and ensure that a specified number of them successfully terminate. When the specified number of completions is successfully reached, the job is complete.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Increment' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const expected = (job.spec?.parallelism ?? 1) + 1;
    await waitFor(() =>
      expect(patches).toEqual([
        {
          path: expect.stringMatching(/\/namespaces\/shop\/jobs\/migrate-db$/) as unknown,
          body: [{ op: 'replace', path: '/spec/parallelism', value: expected }],
        },
      ]),
    );
    expect((stored(JobModel, 'migrate-db') as CountedWorkload).spec?.parallelism).toBe(expected);
  });

  it('ACT-4: a read-only grant disables Edit Pod count and Restart rollout of a StatefulSet with the reason', async () => {
    setMockUser('alice');
    const patches = recordPatches();
    const descriptor = { ...statefulSetDescriptor, useKindActions: useStatefulSetScaleActions };
    const { user } = renderWithProviders(
      <ResourceActionsMenu
        cluster="prod-eu-1"
        descriptor={descriptor}
        obj={stored(StatefulSetModel, 'db')}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    for (const name of ['Edit Pod count', 'Restart rollout']) {
      const item = screen.getByRole('menuitem', { name });
      await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
      await user.hover(item);
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
      await user.click(item);
      await user.unhover(item);
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    }
    expect(patches).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
