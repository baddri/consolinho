import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http } from 'msw';
import { NodeModel, setWatchTimingForTests, type K8sResource, type Node } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, problem, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { nodeDescriptor } from '../../registry/kinds/nodes';
import { resourceRoutes } from '../../routes';
import { UNSCHEDULABLE_BODY } from './MarkUnschedulableModal';
import { BARE_POD_POPOVER, nodePodsCountText } from './NodePodsTab';
import { schedulingPatch } from './useNodeScheduling';

const PROXY = '*/api/clusters/:cluster/k8s/*';
const NODES = '/c/dev-1/k8s/cluster/nodes';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

/** A `dev-1` node as the mock stores it. */
function storedNode(name: string): Node & K8sResource {
  const stored = mockK8s.get('dev-1', NodeModel, undefined, name);
  if (!stored) throw new Error(`fixture node ${name} missing`);
  return stored as Node & K8sResource;
}

/** Records method, URL and JSON body of every PATCH and every pods request the proxy receives. */
function recordRequests() {
  const patches: { path: string; body: unknown }[] = [];
  const podQueries: URLSearchParams[] = [];
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (request.method === 'PATCH') {
      void request
        .clone()
        .json()
        .then((body: unknown) => patches.push({ path: url.pathname, body }));
    } else if (url.pathname.endsWith('/api/v1/pods')) podQueries.push(url.searchParams);
  });
  return { patches, podQueries };
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

describe('Node Pods tab (NODE-4)', () => {
  it(
    'lists the pods of every namespace on the node by field selector, with owner, count line and DaemonSet filter',
    async () => {
      const { podQueries } = recordRequests();
      const { user } = renderApp(`${NODES}/worker-2/pods`);

      const table = await screen.findByRole('grid', { name: 'Pods' }, { timeout: COLD_START_TIMEOUT_MS });
      await within(table).findByRole('link', { name: 'node-debug-worker-2' });
      expect(podQueries.length).toBeGreaterThan(0);
      for (const query of podQueries) expect(query.get('fieldSelector')).toBe('spec.nodeName=worker-2');

      // Namespace column (all namespaces) and the controller as Owner.
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Namespace', 'Status', 'Ready', 'Restarts', 'Owner', 'Created', 'Actions']);
      const exporter = within(table).getByRole('link', { name: /^node-exporter-/ }).closest('tr');
      if (!exporter) throw new Error('no node-exporter row');
      expect(within(exporter).getByRole('link', { name: 'node-exporter' })).toBeInTheDocument();
      expect(screen.getByText(/^\d+ pods \(\d+ not managed by a DaemonSet\)$/)).toBeInTheDocument();

      // A bare pod is flagged with the drain warning.
      const bare = within(table).getByRole('link', { name: 'node-debug-worker-2' }).closest('tr');
      if (!bare) throw new Error('no bare pod row');
      await user.click(within(bare).getByRole('button', { name: /No owner/ }));
      const popover = await screen.findByRole('dialog', { name: 'No owner' });
      expect(popover).toHaveTextContent(BARE_POD_POPOVER);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      // "Exclude DaemonSet pods" hides the DaemonSet's pods only.
      const [categoryToggle] = screen.getAllByRole('button', { name: 'Name' });
      if (!categoryToggle) throw new Error('category select not found');
      await user.click(categoryToggle);
      await user.click(await screen.findByRole('menuitem', { name: 'Owner' }));
      await user.click(screen.getByRole('button', { name: 'Filter by owner' }));
      await user.click(await screen.findByRole('checkbox', { name: 'Exclude DaemonSet pods' }));
      await waitFor(() =>
        expect(within(table).queryByRole('link', { name: /^node-exporter-/ })).not.toBeInTheDocument(),
      );
      expect(within(table).getByRole('link', { name: 'node-debug-worker-2' })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('counts the pods and those not managed by a DaemonSet', () => {
    const ds = { metadata: { ownerReferences: [{ apiVersion: 'apps/v1', kind: 'DaemonSet', name: 'd', uid: '1', controller: true }] } };
    expect(nodePodsCountText([ds, {}, {}])).toBe('3 pods (2 not managed by a DaemonSet)');
    expect(nodePodsCountText([ds])).toBe('1 pod (0 not managed by a DaemonSet)');
  });
});

describe('Node scheduling actions (NODE-5)', () => {
  it('builds add / replace / remove patches of spec.unschedulable', () => {
    expect(schedulingPatch({ namespace: undefined, name: 'n', unschedulable: true, hasKey: false })).toEqual([
      { op: 'add', path: '/spec/unschedulable', value: true },
    ]);
    expect(schedulingPatch({ namespace: undefined, name: 'n', unschedulable: true, hasKey: true })).toEqual([
      { op: 'replace', path: '/spec/unschedulable', value: true },
    ]);
    expect(schedulingPatch({ namespace: undefined, name: 'n', unschedulable: false })).toEqual([
      { op: 'remove', path: '/spec/unschedulable' },
    ]);
  });

  it('kind items come first, then Edit labels/annotations, Edit Node and Delete Node', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={nodeDescriptor} obj={storedNode('worker-1')} />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Mark as unschedulable',
      'Edit labels',
      'Edit annotations',
      'Edit Node',
      'Delete Node',
    ]);
  });

  it(
    'Mark as unschedulable confirms naming the cluster, patches, and the status flips via the watch',
    async () => {
      const { patches } = recordRequests();
      const { user } = renderApp(`${NODES}/worker-1`);

      await user.click(await openEnabledItem(user, 'Mark as unschedulable'));
      const dialog = await screen.findByRole('dialog', { name: 'Mark as unschedulable' });
      await waitFor(() => expect(dialog).toHaveTextContent('Node worker-1 on Development 1'));
      expect(dialog).toHaveTextContent(UNSCHEDULABLE_BODY);
      await user.click(within(dialog).getByRole('button', { name: 'Mark unschedulable' }));

      expect(await screen.findByText('worker-1 marked as unschedulable on Development 1')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(patches.map((patch) => patch.path)).toEqual(['/api/clusters/dev-1/k8s/api/v1/nodes/worker-1']);
      expect(patches.map((patch) => patch.body)).toEqual([[{ op: 'add', path: '/spec/unschedulable', value: true }]]);
      expect(storedNode('worker-1').spec?.unschedulable).toBe(true);
      expect(await screen.findByText('Scheduling disabled')).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'Mark as schedulable writes without a modal and removes spec.unschedulable',
    async () => {
      const { patches } = recordRequests();
      const { user } = renderApp(`${NODES}/worker-2`);

      expect(await screen.findByText('Scheduling disabled', undefined, { timeout: COLD_START_TIMEOUT_MS })).toBeInTheDocument();
      await user.click(await openEnabledItem(user, 'Mark as schedulable'));
      expect(screen.queryByRole('menuitem', { name: 'Mark as unschedulable' })).not.toBeInTheDocument();

      expect(await screen.findByText('worker-2 marked as schedulable on Development 1')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(patches.map((patch) => patch.path)).toEqual(['/api/clusters/dev-1/k8s/api/v1/nodes/worker-2']);
      expect(patches.map((patch) => patch.body)).toEqual([[{ op: 'remove', path: '/spec/unschedulable' }]]);
      await waitFor(() => expect(screen.queryByText('Scheduling disabled')).not.toBeInTheDocument());
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('a read-only grant disables the item with the reason', async () => {
    setMockUser('alice');
    const { patches } = recordRequests();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={nodeDescriptor} obj={storedNode('worker-1')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = screen.getByRole('menuitem', { name: 'Mark as unschedulable' });
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
    await user.click(item);
    expect(patches).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it(
    "shows the proxy's 403 inline in the modal",
    async () => {
      server.use(
        http.patch(PROXY, () =>
          problem(403, { code: 'Proxy.ReadOnlyGrant', detail: 'Your access to dev-1 is read-only.' }),
        ),
      );
      const { user } = renderApp(`${NODES}/worker-1`);

      await user.click(await openEnabledItem(user, 'Mark as unschedulable'));
      const dialog = await screen.findByRole('dialog', { name: 'Mark as unschedulable' });
      await user.click(within(dialog).getByRole('button', { name: 'Mark unschedulable' }));

      expect(await within(dialog).findByText('Your access to dev-1 is read-only.')).toBeInTheDocument();
      expect(storedNode('worker-1').spec?.unschedulable).toBeUndefined();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
