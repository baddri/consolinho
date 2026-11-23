import { screen, waitFor, within } from '@testing-library/react';
import { DaemonSetModel, setWatchTimingForTests, type DaemonSet } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { daemonSetDescriptor, type DaemonSetResource } from '../../registry/kinds/daemonsets';
import { resourceRoutes } from '../../routes';
import { RESTARTED_AT_ANNOTATION } from '../scale/useRestartRollout';

const DETAILS = '/c/dev-1/k8s/ns/shop/daemonsets/node-agent';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});
afterEach(() => server.events.removeAllListeners());

/** The `node-agent` DaemonSet of `dev-1` as the mock stores it. */
function nodeAgent(): DaemonSetResource {
  const stored = mockK8s.get('dev-1', DaemonSetModel, 'shop', 'node-agent');
  if (!stored) throw new Error('fixture daemonset node-agent missing');
  return stored as DaemonSet as DaemonSetResource;
}

describe('DaemonSets (T-0191)', () => {
  it(
    'WL-2: the list shows OCP workload columns and "2 of 2 pods" links to the Pods tab',
    async () => {
      renderApp('/c/dev-1/k8s/ns/shop/daemonsets');

      const table = await screen.findByRole('grid', { name: 'DaemonSets' }, { timeout: COLD_START_TIMEOUT_MS });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Status', 'Labels', 'Pod selector', 'Actions']);
      const status = await within(table).findByRole('link', { name: '2 of 2 pods' });
      expect(status).toHaveAttribute('href', `${DETAILS}/pods`);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-2/4: details show OCP tabs, a read-only ring, Current/Desired count, and the Pods tab lists node-agent pods',
    async () => {
      const { user } = renderApp(DETAILS);

      await screen.findByRole('tab', { name: 'Details', selected: true }, { timeout: COLD_START_TIMEOUT_MS });
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Details',
        'YAML',
        'Pods',
        'Events',
      ]);
      expect(await screen.findByRole('img', { name: /^2 Pods/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Increase the Pod count' })).not.toBeInTheDocument();
      const terms = screen.getAllByRole('term').map((term) => term.textContent);
      expect(terms).toEqual(expect.arrayContaining(['Current count', 'Desired count']));

      await user.click(screen.getByRole('tab', { name: 'Pods' }));
      const table = await screen.findByRole('grid', { name: 'Pods' }, { timeout: COLD_START_TIMEOUT_MS });
      for (const name of ['node-agent-h7x2k', 'node-agent-q9m4t']) {
        expect(await within(table).findByRole('link', { name })).toBeInTheDocument();
      }
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('WL-4: Restart rollout is the only kind item (no count item), then the common items', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={daemonSetDescriptor} obj={nodeAgent()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([
      'Restart rollout',
      'Edit labels',
      'Edit annotations',
      'Edit DaemonSet',
      'Delete DaemonSet',
    ]);
  });

  it(
    'WL-4: Restart rollout sets restartedAt on the pod template',
    async () => {
      const { user } = renderApp(DETAILS);

      await user.click(
        await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }),
      );
      const restart = screen.getByRole('menuitem', { name: 'Restart rollout' });
      await waitFor(() => expect(restart).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(restart);

      expect(await screen.findByText('Rollout restarted for node-agent on Development 1')).toBeInTheDocument();
      const restartedAt = nodeAgent().spec?.template.metadata?.annotations?.[RESTARTED_AT_ANNOTATION];
      expect(Number.isNaN(Date.parse(restartedAt ?? ''))).toBe(false);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('ACT-4: a read-only grant disables Restart rollout with the reason', async () => {
    setMockUser('alice');
    const patches: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PATCH') patches.push(request.url);
    });
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={daemonSetDescriptor} obj={nodeAgent()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const restart = screen.getByRole('menuitem', { name: 'Restart rollout' });
    await waitFor(() => expect(restart).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(restart);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
    await user.click(restart);
    expect(patches).toEqual([]);
  });
});
