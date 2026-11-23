import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import {
  DeploymentModel,
  ReplicaSetModel,
  setWatchTimingForTests,
  type Deployment,
  type K8sResource,
  type ReplicaSet,
} from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { replicaSetDescriptor, type ReplicaSetResource } from '../../registry/kinds/replicasets';
import { resourceRoutes } from '../../routes';
import { ROLLBACK_PAUSED_MESSAGE } from './RollbackModal';
import { rollbackPatch } from './useRollbackDeployment';

const TAB = '/c/dev-1/k8s/ns/shop/deployments/web/replicasets';
const CURRENT = 'web-7d4b9c8f6d';
const OLD = 'web-5c6d7e8f9a';
const OLD_IMAGE = 'quay.io/example/web:1.0';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

function stored(model: typeof DeploymentModel, name: string): K8sResource {
  const obj = mockK8s.get('dev-1', model, 'shop', name);
  if (!obj) throw new Error(`fixture ${name} missing`);
  return obj;
}

const web = () => stored(DeploymentModel, 'web') as Deployment & K8sResource;

/**
 * Seeds revision 3 of `web` (scaled to 0, an older image, a user annotation) and a ReplicaSet that matches `web`'s
 * selector but belongs to another Deployment; returns the old one.
 */
function seedReplicaSets(): ReplicaSetResource {
  const current = stored(ReplicaSetModel, CURRENT) as ReplicaSetResource;
  const hash = OLD.slice(4);
  const old: ReplicaSetResource = {
    ...current,
    metadata: {
      ...current.metadata,
      name: OLD,
      uid: 'rs-old-uid',
      resourceVersion: undefined,
      creationTimestamp: '2026-01-01T00:00:00Z',
      labels: { app: 'web', 'pod-template-hash': hash },
      annotations: { 'deployment.kubernetes.io/revision': '3', 'example.com/note': 'v1' },
    },
    spec: {
      replicas: 0,
      selector: { matchLabels: { app: 'web', 'pod-template-hash': hash } },
      template: {
        metadata: { labels: { app: 'web', 'pod-template-hash': hash } },
        spec: { ...current.spec?.template?.spec, containers: [{ name: 'web', image: OLD_IMAGE }] },
      },
    },
    status: { replicas: 0 },
  };
  const foreign: ReplicaSetResource = {
    ...old,
    metadata: {
      ...old.metadata,
      name: 'web-canary-1a2b3c',
      uid: 'rs-foreign-uid',
      annotations: { 'deployment.kubernetes.io/revision': '9' },
      ownerReferences: [{ apiVersion: 'apps/v1', kind: 'Deployment', name: 'web-canary', uid: 'other-uid' }],
    },
  };
  mockK8s.upsert('dev-1', old);
  mockK8s.upsert('dev-1', foreign);
  return stored(ReplicaSetModel, OLD) as ReplicaSetResource;
}

function recordPatches(): string[] {
  const patches: string[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PATCH') patches.push(new URL(request.url).pathname);
  });
  return patches;
}

/** The table row of `name` once the tab has listed it. */
async function rowOf(name: string): Promise<HTMLElement> {
  const link = await screen.findByRole('link', { name }, { timeout: COLD_START_TIMEOUT_MS });
  const row = link.closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

/** Opens `name`'s row kebab and returns its "Rollback" item once access allowed it. */
async function openRollback(user: UserEvent, name: string): Promise<void> {
  await user.click(within(await rowOf(name)).getByRole('button', { name: 'Kebab toggle' }));
  const item = await screen.findByRole('menuitem', { name: 'Rollback' });
  await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
  await user.click(item);
}

describe('Deployment ReplicaSets tab and Rollback (T-0185)', () => {
  it(
    'DEP-9: lists only the ReplicaSets the Deployment owns, newest revision first, with Status/Revision/Created',
    async () => {
      seedReplicaSets();
      renderApp(TAB);

      const panel = await screen.findByRole('tabpanel', { name: 'ReplicaSets' });
      await rowOf(OLD);
      for (const title of ['Name', 'Status', 'Revision', 'Created']) {
        expect(within(panel).getByRole('columnheader', { name: new RegExp(`^${title}`) })).toBeInTheDocument();
      }
      expect(within(panel).queryByRole('columnheader', { name: /^Namespace/ })).not.toBeInTheDocument();
      const names = within(panel)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0]?.textContent);
      expect(names).toEqual([expect.stringContaining(CURRENT), expect.stringContaining(OLD)]);
      expect(within(await rowOf(CURRENT)).getByText('3 of 3 pods')).toBeInTheDocument();
      expect(within(await rowOf(OLD)).getByText('3')).toBeInTheDocument();
      expect(screen.queryByText('web-canary-1a2b3c')).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'DEP-10: Rollback is absent on the current revision and on an old one sends one PATCH of the Deployment',
    async () => {
      seedReplicaSets();
      const patches = recordPatches();
      const { user } = renderApp(TAB);

      await user.click(within(await rowOf(CURRENT)).getByRole('button', { name: 'Kebab toggle' }));
      expect(await screen.findByRole('menuitem', { name: 'Edit ReplicaSet' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Rollback' })).not.toBeInTheDocument();
      await user.keyboard('{Escape}');

      await openRollback(user, OLD);
      const dialog = await screen.findByRole('dialog', { name: 'Rollback' });
      await waitFor(() => expect(dialog).toHaveTextContent('Deployment web in shop on Development 1'));
      expect(
        await within(dialog).findByText(/Are you sure you want to rollback to/),
      ).toHaveTextContent(`Are you sure you want to rollback to ${OLD}?`);
      await user.click(within(dialog).getByRole('button', { name: 'Rollback' }));

      expect(await screen.findByText('Rolled back web to revision 3 on Development 1')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(patches).toEqual([expect.stringMatching(/\/namespaces\/shop\/deployments\/web$/)]);
      const template = web().spec?.template;
      expect(template?.metadata?.labels).toEqual({ app: 'web' });
      expect(template?.spec?.containers[0]?.image).toBe(OLD_IMAGE);
      expect(web().metadata.annotations).toEqual(
        expect.objectContaining({ 'example.com/note': 'v1' }),
      );
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'DEP-10: while the Deployment is paused the modal shows OCP’s message and Rollback is disabled',
    async () => {
      seedReplicaSets();
      const paused = web();
      mockK8s.upsert('dev-1', { ...paused, spec: { ...paused.spec, paused: true } } as K8sResource);
      const patches = recordPatches();
      const { user } = renderApp(TAB);

      await openRollback(user, OLD);
      const dialog = await screen.findByRole('dialog', { name: 'Rollback' });
      expect(await within(dialog).findByText(ROLLBACK_PAUSED_MESSAGE)).toBeInTheDocument();
      expect(within(dialog).getByText('Unable to Rollback')).toBeInTheDocument();
      const submit = within(dialog).getByRole('button', { name: 'Rollback' });
      expect(submit).toBeDisabled();
      await user.click(submit);
      expect(patches).toEqual([]);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('ACT-4: a read-only grant disables Rollback with the reason and sends nothing', async () => {
    setMockUser('alice');
    const old = seedReplicaSets();
    const patches = recordPatches();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={replicaSetDescriptor} obj={old} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = screen.getByRole('menuitem', { name: 'Rollback' });
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
    await user.click(item);
    expect(patches).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('rollbackPatch', () => {
  it('replaces the template minus pod-template-hash and merges annotations as OCP', () => {
    const deployment: Deployment = {
      metadata: {
        annotations: {
          'deployment.kubernetes.io/revision': '4',
          'kubectl.kubernetes.io/last-applied-configuration': '{}',
          'example.com/dropped': 'x',
        },
      },
    };
    const replicaSet: ReplicaSet = {
      metadata: { annotations: { 'deployment.kubernetes.io/revision': '3', 'example.com/note': 'v1' } },
      spec: {
        selector: {},
        template: { metadata: { labels: { app: 'web', 'pod-template-hash': 'abc' } } },
      },
    };

    expect(rollbackPatch(deployment, replicaSet)).toEqual([
      { op: 'replace', path: '/spec/template', value: { metadata: { labels: { app: 'web' } } } },
      {
        op: 'replace',
        path: '/metadata/annotations',
        value: {
          'deployment.kubernetes.io/revision': '4',
          'kubectl.kubernetes.io/last-applied-configuration': '{}',
          'example.com/note': 'v1',
        },
      },
    ]);
    expect(replicaSet.spec?.template?.metadata?.labels).toHaveProperty('pod-template-hash', 'abc');
  });
});
