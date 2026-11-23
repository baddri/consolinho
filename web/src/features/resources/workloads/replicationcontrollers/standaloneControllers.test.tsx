import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import {
  ReplicaSetModel,
  ReplicationControllerModel,
  setWatchTimingForTests,
  type K8sModel,
  type K8sResource,
} from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { replicaSetDescriptor, type ReplicaSetResource } from '../../registry/kinds/replicasets';
import {
  replicationControllerDescriptor,
  type ReplicationControllerResource,
} from '../../registry/kinds/replicationcontrollers';
import { resourceRoutes } from '../../routes';

const NS = '/c/dev-1/k8s/ns/shop';
const SSAR_PATH = '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews';

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

const legacyRs = () => stored(ReplicaSetModel, 'legacy-rs') as ReplicaSetResource;
const legacyRc = () => stored(ReplicationControllerModel, 'legacy-rc') as ReplicationControllerResource;

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

/** Records the `resource` of every SelfSubjectAccessReview sent. */
function recordReviewedResources(): string[] {
  const resources: string[] = [];
  server.events.on('request:start', ({ request }) => {
    if (!new URL(request.url).pathname.endsWith(SSAR_PATH)) return;
    void request
      .clone()
      .json()
      .then((body: { spec: { resourceAttributes: { resource: string } } }) =>
        resources.push(body.spec.resourceAttributes.resource),
      );
  });
  return resources;
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

describe('ReplicationControllers (T-0192)', () => {
  it(
    'WL-5: the list shows OCP columns incl. Phase and the DeploymentConfig owner link',
    async () => {
      renderApp(`${NS}/replicationcontrollers`);

      const table = await screen.findByRole(
        'grid',
        { name: 'ReplicationControllers' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Status', 'Phase', 'Owner', 'Created', 'Actions']);

      const row = (await within(table).findByRole('link', { name: 'frontend-2' })).closest('tr');
      if (!row) throw new Error('row frontend-2 missing');
      expect(within(row).getByText('Complete')).toBeInTheDocument();
      expect(within(row).getByRole('link', { name: 'frontend' })).toHaveAttribute(
        'href',
        `${NS}/deploymentconfigs/frontend`,
      );
      const legacy = within(table).getByRole('link', { name: 'legacy-rc' }).closest('tr');
      if (!legacy) throw new Error('row legacy-rc missing');
      expect(within(legacy).getByRole('link', { name: '1 of 1 pods' })).toHaveAttribute(
        'href',
        `${NS}/replicationcontrollers/legacy-rc/pods`,
      );
      expect(within(legacy).getByText('No owner')).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-5: DC-owned details show the owner link and revision; the Pods tab lists the RC pods',
    async () => {
      const { user } = renderApp(`${NS}/replicationcontrollers/frontend-2`);

      await screen.findByRole('tab', { name: 'Details', selected: true }, { timeout: COLD_START_TIMEOUT_MS });
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Details',
        'YAML',
        'Pods',
        'Events',
      ]);
      expect(await screen.findByRole('link', { name: 'frontend' })).toHaveAttribute(
        'href',
        `${NS}/deploymentconfigs/frontend`,
      );
      expect(screen.getByText('Deployment revision')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: 'Pods' }));
      const table = await screen.findByRole('grid', { name: 'Pods' }, { timeout: COLD_START_TIMEOUT_MS });
      const names = (await within(table).findAllByRole('link', { name: /^frontend-2-/ })).map(
        (link) => link.textContent,
      );
      expect(names.length).toBeGreaterThan(0);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'WL-5: Edit Pod count on legacy-rc PATCHes replicationcontrollers/legacy-rc/scale',
    async () => {
      const patches = recordPatches();
      const { user } = renderApp(`${NS}/replicationcontrollers/legacy-rc`);

      await user.click(await openEnabledItem(user, 'Edit Pod count'));
      const dialog = await screen.findByRole('dialog', { name: 'Edit Pod count' });
      await user.click(within(dialog).getByRole('button', { name: 'Increment' }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('legacy-rc scaled to 2 on Development 1')).toBeInTheDocument();
      expect(patches).toEqual([
        {
          path: expect.stringMatching(/\/namespaces\/shop\/replicationcontrollers\/legacy-rc\/scale$/) as unknown,
          body: [{ op: 'replace', path: '/spec/replicas', value: 2 }],
        },
      ]);
      expect(legacyRc().spec?.replicas).toBe(2);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('ACT-4: a read-only grant disables Edit Pod count with the reason', async () => {
    setMockUser('alice');
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={replicationControllerDescriptor} obj={legacyRc()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = screen.getByRole('menuitem', { name: 'Edit Pod count' });
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
  });
});

describe('standalone ReplicaSets (T-0192)', () => {
  it(
    'WL-5: Edit Pod count on legacy-rs PATCHes replicasets/legacy-rs/scale',
    async () => {
      const patches = recordPatches();
      const { user } = renderApp(`${NS}/replicasets/legacy-rs`);

      await user.click(await openEnabledItem(user, 'Edit Pod count'));
      const dialog = await screen.findByRole('dialog', { name: 'Edit Pod count' });
      await user.click(within(dialog).getByRole('button', { name: 'Increment' }));
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('legacy-rs scaled to 2 on Development 1')).toBeInTheDocument();
      expect(patches).toEqual([
        {
          path: expect.stringMatching(/\/namespaces\/shop\/replicasets\/legacy-rs\/scale$/) as unknown,
          body: [{ op: 'replace', path: '/spec/replicas', value: 2 }],
        },
      ]);
      expect(legacyRs().spec?.replicas).toBe(2);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('sends no deployments access review for a ReplicaSet without a Deployment owner', async () => {
    const reviewed = recordReviewedResources();
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={replicaSetDescriptor} obj={legacyRs()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([
      'Edit Pod count',
      'Edit labels',
      'Edit annotations',
      'Edit ReplicaSet',
      'Delete ReplicaSet',
    ]);
    const editCount = screen.getByRole('menuitem', { name: 'Edit Pod count' });
    await waitFor(() => expect(editCount).not.toHaveAttribute('aria-disabled', 'true'));
    expect(reviewed).toContain('replicasets');
    expect(reviewed).not.toContain('deployments');
  });

  it('ACT-4: a read-only grant disables Edit Pod count with the reason', async () => {
    setMockUser('alice');
    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="prod-eu-1" descriptor={replicaSetDescriptor} obj={legacyRs()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = screen.getByRole('menuitem', { name: 'Edit Pod count' });
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
  });
});
