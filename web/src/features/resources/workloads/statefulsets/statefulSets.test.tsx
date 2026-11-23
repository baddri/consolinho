import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { StatefulSetModel, setWatchTimingForTests, type StatefulSet } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { statefulSetDescriptor, type StatefulSetResource } from '../../registry/kinds/statefulsets';
import { resourceRoutes } from '../../routes';
import { RESTARTED_AT_ANNOTATION } from '../scale/useRestartRollout';

const DETAILS = '/c/dev-1/k8s/ns/shop/statefulsets/db';
const KIND_ITEMS = ['Edit Pod count', 'Restart rollout'];

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});
afterEach(() => server.events.removeAllListeners());

/** The `db` StatefulSet of `dev-1` as the mock stores it. */
function db(): StatefulSetResource {
  const stored = mockK8s.get('dev-1', StatefulSetModel, 'shop', 'db');
  if (!stored) throw new Error('fixture statefulset db missing');
  return stored as StatefulSet as StatefulSetResource;
}

/** Records path and body of every PATCH the proxy receives. */
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

/** Opens the details page's Actions menu and returns `name`'s item once its access review allowed it. */
async function openEnabledItem(user: UserEvent, name: string): Promise<HTMLElement> {
  await user.click(
    await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
  );
  const item = screen.getByRole('menuitem', { name });
  await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
  return item;
}

describe('StatefulSets (T-0191)', () => {
  it(
    'WL-2: the list shows OCP workload columns and "3 of 3 pods" links to the Pods tab',
    async () => {
      renderApp('/c/dev-1/k8s/ns/shop/statefulsets');

      const table = await screen.findByRole('grid', { name: 'StatefulSets' }, { timeout: COLD_START_TIMEOUT_MS });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      // Namespace shows only in all-namespaces scope, as on Deployments.
      expect(headers).toEqual(['Name', 'Status', 'Labels', 'Pod selector', 'Actions']);
      const status = await within(table).findByRole('link', { name: '3 of 3 pods' });
      expect(status).toHaveAttribute('href', `${DETAILS}/pods`);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-2: details show OCP tabs and the Pods tab lists db-0..2',
    async () => {
      const { user } = renderApp(DETAILS);

      await screen.findByRole('tab', { name: 'Details', selected: true }, { timeout: COLD_START_TIMEOUT_MS });
      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs).toEqual(['Details', 'YAML', 'Pods', 'Events']);
      await user.click(screen.getByRole('tab', { name: 'Pods' }));
      const table = await screen.findByRole('grid', { name: 'Pods' }, { timeout: COLD_START_TIMEOUT_MS });
      for (const name of ['db-0', 'db-1', 'db-2']) {
        expect(await within(table).findByRole('link', { name })).toBeInTheDocument();
      }
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('WL-3: kind items come first, then the common items', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={statefulSetDescriptor} obj={db()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([
      ...KIND_ITEMS,
      'Edit labels',
      'Edit annotations',
      'Edit StatefulSet',
      'Delete StatefulSet',
    ]);
  });

  it(
    'WL-3: Edit Pod count names the cluster and PATCHes statefulsets/db/scale',
    async () => {
      const patches = recordPatches();
      const { user } = renderApp(DETAILS);

      await user.click(await openEnabledItem(user, 'Edit Pod count'));
      const dialog = await screen.findByRole('dialog', { name: 'Edit Pod count' });
      await waitFor(() => expect(dialog).toHaveTextContent('StatefulSet db in shop on Development 1'));
      await user.click(within(dialog).getByRole('button', { name: 'Increment' }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('db scaled to 4 on Development 1')).toBeInTheDocument();
      expect(patches).toEqual([
        {
          path: expect.stringMatching(/\/namespaces\/shop\/statefulsets\/db\/scale$/) as unknown,
          body: [{ op: 'replace', path: '/spec/replicas', value: 4 }],
        },
      ]);
      expect(db().spec?.replicas).toBe(4);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-3: the ring arrows scale the StatefulSet',
    async () => {
      const patches = recordPatches();
      const { user } = renderApp(DETAILS);

      const down = await screen.findByRole(
        'button',
        { name: 'Decrease the Pod count' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      await user.click(down);
      expect(screen.getByRole('img', { name: /Scaling to 2/ })).toBeInTheDocument();

      expect(
        await screen.findByText('db scaled to 2 on Development 1', {}, { timeout: 3000 }),
      ).toBeInTheDocument();
      expect(patches).toEqual([
        {
          path: expect.stringMatching(/\/namespaces\/shop\/statefulsets\/db\/scale$/) as unknown,
          body: [{ op: 'replace', path: '/spec/replicas', value: 2 }],
        },
      ]);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-3: Restart rollout sets restartedAt on the pod template',
    async () => {
      const { user } = renderApp(DETAILS);

      await user.click(await openEnabledItem(user, 'Restart rollout'));

      expect(await screen.findByText('Rollout restarted for db on Development 1')).toBeInTheDocument();
      const restartedAt = db().spec?.template.metadata?.annotations?.[RESTARTED_AT_ANNOTATION];
      expect(Number.isNaN(Date.parse(restartedAt ?? ''))).toBe(false);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('ACT-4: a read-only grant disables every kind item with the reason', async () => {
    setMockUser('alice');
    const patches = recordPatches();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={statefulSetDescriptor} obj={db()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    for (const name of KIND_ITEMS) {
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
