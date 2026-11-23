import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  DeploymentModel,
  setWatchTimingForTests,
  type Deployment,
  type K8sResource,
} from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { deploymentDescriptor } from '../../registry/kinds/deployments';
import { resourceRoutes } from '../../routes';
import { RESTART_PAUSED_REASON } from './useDeploymentActions';
import { RESTARTED_AT_ANNOTATION, restartRolloutPatch } from './useDeploymentRollout';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const SSAR_PATH = '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews';
const DETAILS = '/c/dev-1/k8s/ns/shop/deployments/web';
const KIND_ITEMS = ['Edit Pod count', 'Pause rollouts', 'Restart rollout'];

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** The `web` deployment of `dev-1` as the mock stores it. */
function web(): Deployment & K8sResource {
  const stored = mockK8s.get('dev-1', DeploymentModel, 'shop', 'web');
  if (!stored) throw new Error('fixture deployment web missing');
  return stored as Deployment & K8sResource;
}

/** Records the path of every PATCH the proxy receives. */
function recordPatches(): string[] {
  const patches: string[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PATCH') patches.push(new URL(request.url).pathname);
  });
  return patches;
}

/** Opens the details page's Actions menu and returns `name`'s item once its access review allowed it. */
async function openEnabledItem(user: UserEvent, name: string): Promise<HTMLElement> {
  await user.click(
    await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
  );
  const item = screen.getByRole('menuitem', { name });
  await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
  return item;
}

describe('Deployment actions (T-0182)', () => {
  it('DEP-4: kind items come first, in OCP order, then Edit labels/annotations, Edit Deployment and Delete Deployment', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={deploymentDescriptor} obj={web()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([...KIND_ITEMS, 'Edit labels', 'Edit annotations', 'Edit Deployment', 'Delete Deployment']);
  });

  it(
    'DEP-3: Edit Pod count names the cluster, PATCHes …/scale and the ring follows live',
    async () => {
      const patches = recordPatches();
      const { user } = renderApp(DETAILS);

      await user.click(await openEnabledItem(user, 'Edit Pod count'));
      const dialog = await screen.findByRole('dialog', { name: 'Edit Pod count' });
      await waitFor(() => expect(dialog).toHaveTextContent('Deployment web in shop on Development 1'));
      const input = within(dialog).getByRole('spinbutton', { name: 'Pod count' });
      expect(input).toHaveValue(3);
      // F2: the count field, not the Close button, has focus on open (OCP `NumberSpinner autoFocus`).
      await waitFor(() => expect(input).toHaveFocus());
      // F1: the help text is the header description (OCP `ModalHeader description`), not a body row.
      expect(dialog).toHaveAccessibleDescription(
        'Deployments maintain the desired number of healthy pods.',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Increment' }));
      await user.click(within(dialog).getByRole('button', { name: 'Increment' }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('web scaled to 5 on Development 1')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(patches).toEqual([expect.stringMatching(/\/namespaces\/shop\/deployments\/web\/scale$/)]);
      expect(web().spec?.replicas).toBe(5);
      expect(
        await screen.findByRole('img', { name: /Scaling to 5/ }, { timeout: COLD_START_TIMEOUT_MS }),
      ).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'DEP-6: Pause rollouts sets spec.paused, shows the alert, and its Resume link clears both',
    async () => {
      const { user } = renderApp(DETAILS);

      await user.click(await openEnabledItem(user, 'Pause rollouts'));
      expect(await screen.findByText('Rollouts paused for web on Development 1')).toBeInTheDocument();
      expect(web().spec?.paused).toBe(true);
      const alert = await screen.findByText('web is paused');
      expect(
        screen.getByText('This will stop any new rollouts or triggers from running until resumed.'),
      ).toBeInTheDocument();

      await user.click(await screen.findByRole('button', { name: 'Actions' }));
      expect(screen.getByRole('menuitem', { name: 'Resume rollouts' })).toBeInTheDocument();
      await user.keyboard('{Escape}');

      const resume = screen.getByRole('button', { name: 'Resume rollouts' });
      await waitFor(() => expect(resume).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(resume);
      await waitFor(() => expect(alert).not.toBeInTheDocument());
      expect(web().spec?.paused).toBe(false);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'DEP-7: Restart rollout sets restartedAt on a template without annotations',
    async () => {
      expect(web().spec?.template.metadata?.annotations).toBeUndefined();
      const { user } = renderApp(DETAILS);

      await user.click(await openEnabledItem(user, 'Restart rollout'));
      expect(await screen.findByText('Rollout restarted for web on Development 1')).toBeInTheDocument();
      const restartedAt = web().spec?.template.metadata?.annotations?.[RESTARTED_AT_ANNOTATION];
      expect(Number.isNaN(Date.parse(restartedAt ?? ''))).toBe(false);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('DEP-7: the patch keeps existing template annotations and only adds restartedAt', () => {
    const now = new Date('2026-11-23T10:00:00Z');
    const annotated: Deployment = {
      spec: {
        selector: {},
        template: { metadata: { annotations: { team: 'shop' } } },
      },
    };
    expect(restartRolloutPatch(annotated, now)).toEqual([
      {
        op: 'add',
        path: '/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt',
        value: '2026-11-23T10:00:00.000Z',
      },
    ]);
    expect(restartRolloutPatch({ spec: { selector: {}, template: {} } }, now)[0]).toEqual({
      op: 'add',
      path: '/spec/template/metadata/annotations',
      value: {},
    });
  });

  it('DEP-7: Restart rollout is aria-disabled while paused, with OCP’s reason', async () => {
    const paused = { ...web(), spec: { ...web().spec, paused: true } } as Deployment & K8sResource;
    const patches = recordPatches();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={deploymentDescriptor} obj={paused} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const resume = screen.getByRole('menuitem', { name: 'Resume rollouts' });
    await waitFor(() => expect(resume).not.toHaveAttribute('aria-disabled', 'true'));
    const restart = screen.getByRole('menuitem', { name: 'Restart rollout' });
    expect(restart).toHaveAttribute('aria-disabled', 'true');
    await user.hover(restart);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(RESTART_PAUSED_REASON);
    await user.click(restart);
    expect(patches).toEqual([]);
  });

  it('DEP-11: a read-only grant disables every kind item with the reason', async () => {
    setMockUser('alice');
    const patches = recordPatches();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={deploymentDescriptor} obj={web()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    for (const name of KIND_ITEMS) {
      const item = screen.getByRole('menuitem', { name });
      await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
      await user.hover(item);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Your access to prod-eu-1 is read-only.',
      );
      await user.click(item);
      await user.unhover(item);
      await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    }
    expect(patches).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('DEP-11: denying only patch deployments/scale disables only Edit Pod count', async () => {
    server.use(
      http.post(PROXY, async ({ request }) => {
        if (!new URL(request.url).pathname.endsWith(SSAR_PATH)) return undefined;
        const review = (await request.clone().json()) as {
          spec: { resourceAttributes: { subresource?: string } };
        };
        if (review.spec.resourceAttributes.subresource !== 'scale') return undefined;
        return HttpResponse.json(
          {
            apiVersion: 'authorization.k8s.io/v1',
            kind: 'SelfSubjectAccessReview',
            spec: review.spec,
            status: { allowed: false, reason: '' },
          },
          { status: 201 },
        );
      }),
    );
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={deploymentDescriptor} obj={web()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const pause = screen.getByRole('menuitem', { name: 'Pause rollouts' });
    const restart = screen.getByRole('menuitem', { name: 'Restart rollout' });
    await waitFor(() => expect(pause).not.toHaveAttribute('aria-disabled', 'true'));
    expect(restart).not.toHaveAttribute('aria-disabled', 'true');
    const count = screen.getByRole('menuitem', { name: 'Edit Pod count' });
    expect(count).toHaveAttribute('aria-disabled', 'true');
    await user.hover(count);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('deployments/scale');
  });
});
