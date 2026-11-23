import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import {
  DeploymentConfigModel,
  ReplicationControllerModel,
  setWatchTimingForTests,
  type DeploymentConfig,
  type K8sModel,
  type K8sResource,
} from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { deploymentConfigDescriptor } from '../../registry/kinds/deploymentconfigs';
import {
  replicationControllerDescriptor,
  type ReplicationControllerResource,
} from '../../registry/kinds/replicationcontrollers';
import { resourceRoutes } from '../../routes';

const NS = '/c/dev-1/k8s/ns/shop';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});
afterEach(() => server.events.removeAllListeners());

function stored(model: K8sModel, name: string): K8sResource {
  const obj = mockK8s.get('dev-1', model, 'shop', name);
  if (!obj) throw new Error(`fixture ${name} missing`);
  return obj;
}

const frontendDc = () => stored(DeploymentConfigModel, 'frontend') as DeploymentConfig;
const rc = (name: string) => stored(ReplicationControllerModel, name) as ReplicationControllerResource;

/** Records method, path and body of every mutating request the proxy receives. */
function recordWrites(): { method: string; path: string; body: unknown }[] {
  const writes: { method: string; path: string; body: unknown }[] = [];
  server.events.on('request:start', ({ request }) => {
    const path = new URL(request.url).pathname;
    if (!['POST', 'PUT', 'PATCH'].includes(request.method) || path.includes('selfsubjectaccessreviews')) return;
    const method = request.method;
    void request
      .clone()
      .json()
      .then((body: unknown) => writes.push({ method, path, body }));
  });
  return writes;
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

describe('DeploymentConfigs (T-0193)', () => {
  it(
    'WL-1/6: the list shows the deprecation alert and the Deployment-like columns',
    async () => {
      renderApp(`${NS}/deploymentconfigs`);

      const table = await screen.findByRole(
        'grid',
        { name: 'DeploymentConfigs' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(screen.getByText('DeploymentConfig is being deprecated with OpenShift 4.14')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Learn more about Deployments/ })).toHaveAttribute(
        'href',
        'https://docs.okd.io/latest/applications/deployments/what-deployments-are.html',
      );
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Status', 'Labels', 'Pod selector', 'Actions']);
      const row = (await within(table).findByRole('link', { name: 'frontend' })).closest('tr');
      if (!row) throw new Error('row frontend missing');
      expect(within(row).getByRole('link', { name: /of \d+ pods$/ })).toHaveAttribute(
        'href',
        `${NS}/deploymentconfigs/frontend/pods`,
      );
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-6: details show OCP tabs, "Latest version" and the actions in OCP order',
    async () => {
      const { user } = renderApp(`${NS}/deploymentconfigs/frontend`);

      await screen.findByRole('tab', { name: 'Details', selected: true }, { timeout: COLD_START_TIMEOUT_MS });
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Details',
        'YAML',
        'ReplicationControllers',
        'Pods',
        'Events',
      ]);
      expect(await screen.findByText('Latest version')).toBeInTheDocument();
      expect(screen.getByText('Update strategy')).toBeInTheDocument();
      expect(screen.getByText('DeploymentConfig is being deprecated with OpenShift 4.14')).toBeInTheDocument();

      await openEnabledItem(user, 'Start rollout');
      expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Edit Pod count',
        'Start rollout',
        'Retry rollout',
        'Pause rollouts',
        'Edit labels',
        'Edit annotations',
        'Edit DeploymentConfig',
        'Delete DeploymentConfig',
      ]);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-6: Start rollout POSTs a DeploymentRequest to instantiate and toasts',
    async () => {
      const writes = recordWrites();
      const before = frontendDc().status?.latestVersion ?? 0;
      const { user } = renderApp(`${NS}/deploymentconfigs/frontend`);

      await user.click(await openEnabledItem(user, 'Start rollout'));

      expect(await screen.findByText('Started rollout of frontend on Development 1')).toBeInTheDocument();
      expect(writes).toEqual([
        {
          method: 'POST',
          path: expect.stringMatching(/\/apis\/apps\.openshift\.io\/v1\/namespaces\/shop\/deploymentconfigs\/frontend\/instantiate$/) as unknown,
          body: {
            kind: 'DeploymentRequest',
            apiVersion: 'apps.openshift.io/v1',
            name: 'frontend',
            latest: true,
            force: true,
          },
        },
      ]);
      expect(frontendDc().status?.latestVersion).toBe(before + 1);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-6: Pause rollouts patches spec.paused and the paused alert offers Resume rollouts',
    async () => {
      const writes = recordWrites();
      const { user } = renderApp(`${NS}/deploymentconfigs/frontend`);

      await user.click(await openEnabledItem(user, 'Pause rollouts'));

      expect(await screen.findByText('frontend is paused')).toBeInTheDocument();
      expect(writes).toEqual([
        {
          method: 'PATCH',
          path: expect.stringMatching(/\/deploymentconfigs\/frontend$/) as unknown,
          body: [{ op: 'add', path: '/spec/paused', value: true }],
        },
      ]);
      const resume = screen.getByRole('button', { name: 'Resume rollouts' });
      await waitFor(() => expect(resume).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(resume);
      await waitFor(() => expect(frontendDc().spec?.paused).toBe(false));
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-6: the ReplicationControllers tab lists the rollouts newest first',
    async () => {
      renderApp(`${NS}/deploymentconfigs/frontend/replicationcontrollers`);

      const table = await screen.findByRole(
        'grid',
        { name: 'ReplicationControllers' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Status', 'Phase', 'Revision', 'Created', 'Actions']);
      await within(table).findByRole('link', { name: 'frontend-2' });
      const names = within(table)
        .getAllByRole('link', { name: /^frontend-\d+$/ })
        .map((link) => link.textContent);
      expect(names).toEqual(['frontend-2', 'frontend-1']);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-6: Rollback on a scaled-down RC POSTs rollback, then PUTs the returned DeploymentConfig',
    async () => {
      const writes = recordWrites();
      const { user } = renderApp(`${NS}/replicationcontrollers/frontend-1`);

      await user.click(await openEnabledItem(user, 'Rollback'));
      const dialog = await screen.findByRole('dialog', { name: 'Rollback' });
      expect(await within(dialog).findByText(/Use the following settings from/)).toBeInTheDocument();
      expect(within(dialog).getByRole('checkbox', { name: 'Replica count and selector' })).not.toBeChecked();
      await user.click(within(dialog).getByRole('button', { name: 'Rollback' }));

      expect(await screen.findByText('Rolled back frontend to revision 1 on Development 1')).toBeInTheDocument();
      expect(writes.map(({ method, path }) => `${method} ${path.replace(/^.*\/namespaces\/shop\//, '')}`)).toEqual([
        'POST deploymentconfigs/frontend/rollback',
        'PUT deploymentconfigs/frontend',
      ]);
      expect(writes[0]?.body).toEqual({
        kind: 'DeploymentConfigRollback',
        apiVersion: 'apps.openshift.io/v1',
        name: 'frontend',
        spec: {
          from: { name: 'frontend-1' },
          revision: 1,
          includeTemplate: true,
          includeReplicationMeta: false,
          includeStrategy: false,
          includeTriggers: false,
        },
      });
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('WL-6: Retry rollout is disabled with OCP\'s reason while the latest RC has not failed', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={deploymentConfigDescriptor} obj={frontendDc()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = screen.getByRole('menuitem', { name: 'Retry rollout' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'This action is only enabled when the latest revision of the ReplicationController resource is in a failed state.',
    );
  });

  it('WL-6: Retry rollout JSON-patches the failed latest RC as OCP does and toasts', async () => {
    const latest = rc(`frontend-${frontendDc().status?.latestVersion ?? 0}`);
    const rcName = latest.metadata.name ?? '';
    mockK8s.upsert('dev-1', {
      ...latest,
      metadata: {
        ...latest.metadata,
        annotations: {
          ...latest.metadata.annotations,
          'openshift.io/deployment.phase': 'Failed',
          'openshift.io/deployment.status-reason': 'deployer pod failed',
        },
      },
    });
    const writes = recordWrites();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={deploymentConfigDescriptor} obj={frontendDc()} />,
    );

    await user.click(await openEnabledItem(user, 'Retry rollout'));

    expect(await screen.findByText(`Retrying rollout ${rcName} on Development 1`)).toBeInTheDocument();
    expect(writes).toEqual([
      {
        method: 'PATCH',
        path: expect.stringMatching(new RegExp(`/api/v1/namespaces/shop/replicationcontrollers/${rcName}$`)) as unknown,
        body: [
          { op: 'replace', path: '/metadata/annotations/openshift.io~1deployment.phase', value: 'New' },
          { op: 'add', path: '/metadata/annotations/openshift.io~1deployment.cancelled', value: '' },
          { op: 'remove', path: '/metadata/annotations/openshift.io~1deployment.cancelled' },
          { op: 'remove', path: '/metadata/annotations/openshift.io~1deployment.status-reason' },
        ],
      },
    ]);
    const annotations = rc(rcName).metadata.annotations ?? {};
    expect(annotations['openshift.io/deployment.phase']).toBe('New');
    expect(annotations).not.toHaveProperty('openshift.io/deployment.status-reason');
  });

  it('WL-6: Rollback is not offered on the RC that runs the pods', async () => {
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={replicationControllerDescriptor} obj={rc('frontend-2')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Rollback' })).not.toBeInTheDocument();
  });

  it.each([
    ['Start rollout', () => frontendDc(), deploymentConfigDescriptor],
    ['Pause rollouts', () => frontendDc(), deploymentConfigDescriptor],
    ['Rollback', () => rc('frontend-1'), replicationControllerDescriptor],
  ] as const)('ACT-4: a read-only grant disables %s with the reason', async (name, obj, descriptor) => {
    setMockUser('alice');
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={descriptor} obj={obj()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = screen.getByRole('menuitem', { name });
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
  });
});
