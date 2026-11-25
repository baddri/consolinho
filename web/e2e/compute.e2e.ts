import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import {
  API_SERVER_URL,
  BARE_POD,
  CATALOG_SOURCE,
  CLUSTER_ID,
  CSV_DISPLAY_NAME,
  CSV_NAME,
  DAEMONSET_POD,
  EVENT_MESSAGE,
  KUBERNETES_VERSION,
  NODE_IMAGE,
  OPENSHIFT_VERSION,
  OPERATOR_NAMESPACE,
  ORPHAN_CSV_DISPLAY_NAME,
  ORPHAN_CSV_NAME,
  OTHER_NODE_POD,
  REPLICASET_POD,
  startFakeComputeApi,
  SUBSCRIPTION_CHANNEL,
  UPDATE_CHANNEL,
  WORKER_NODE,
  type FakeComputeApi,
} from './support/fakeComputeApi';
import {
  EDITOR_SA,
  fakeServiceAccountToken,
  VIEWER_SA,
  type RecordedRequest,
} from './support/fakeWorkloadsApi';
import { CSRF, deleteCluster, loginAs, ok, type DevUser } from './support/session';

/**
 * QG5B-2 (CP5b, T-0339): Nodes (Mark as (un)schedulable, the Pods drain view, Images), the cluster Overview dashboard
 * and Installed Operators end to end — browser → Vite → Api proxy (grant token, mutation guard) → stateful fake API
 * servers. Two clusters (the `e2e-smoke-` prefix, so global setup sweeps leftovers): an **OpenShift** one (discovery
 * serves config.openshift.io, the Machine API and OLM; `bob` read-write with the editor SA, `alice` read-only with the
 * viewer SA) and a **vanilla Kubernetes** one standing in for the spec's `prod-k8s-1` (`bob` read-write).
 */

const OCP_DISPLAY_NAME = 'E2E OpenShift compute';
const K8S_DISPLAY_NAME = 'E2E prod-k8s-1 compute';
const RW_USER: DevUser = 'bob';
const RO_USER: DevUser = 'alice';
const EDITOR_TOKEN = fakeServiceAccountToken(EDITOR_SA);
const VIEWER_TOKEN = fakeServiceAccountToken(VIEWER_SA);

let ocp: FakeComputeApi;
let k8s: FakeComputeApi;
let adminContext: BrowserContext;
let ocpCluster = '';
let k8sCluster = '';

const nodePath = (cluster: string, tab = '') => `/c/${cluster}/k8s/cluster/nodes/${WORKER_NODE}${tab}`;
const csvPath = (name: string, tab = '') =>
  `/c/${ocpCluster}/k8s/ns/${OPERATOR_NAMESPACE}/clusterserviceversions/${name}${tab}`;

/** The mutating requests (PATCH/POST/DELETE) a fake received, SSARs excluded. */
const mutations = (fake: FakeComputeApi): RecordedRequest[] =>
  fake.requests.filter((r) => r.method !== 'GET' && !r.path.endsWith('/selfsubjectaccessreviews'));

/** Opens `path` (redirects to the login page) and logs in as `user` through DevOAuth. */
async function openAs(page: Page, user: DevUser, path: string): Promise<void> {
  await page.goto(path);
  await loginAs(page, user);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

/** The sidebar's link texts in one section, after expanding it. */
async function sectionLinks(page: Page, section: string): Promise<string[]> {
  const nav = page.getByRole('navigation', { name: 'Global' });
  const toggle = nav.getByRole('button', { name: section, exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const region = nav.getByRole('region', { name: section, exact: true });
  await expect(region.getByRole('link').first()).toBeVisible();
  return region.getByRole('link').allTextContents();
}

async function registerCluster(
  api: APIRequestContext,
  name: string,
  displayName: string,
  apiUrl: string,
  distribution: 'openShift' | 'kubernetes',
): Promise<void> {
  await ok(
    await api.post('/api/admin/clusters', {
      headers: CSRF,
      data: {
        name,
        displayName,
        apiUrl,
        environment: 'production',
        distribution,
        webConsoleUrl: null,
        description: 'Playwright CP5b compute/overview/operators (T-0339); deleted after the run.',
        caBundle: null,
        skipTlsVerify: true,
      },
    }),
    `register ${name}`,
  );
}

async function addCredential(
  api: APIRequestContext,
  cluster: string,
  name: string,
  token: string,
): Promise<string> {
  const response = await ok(
    await api.post(`/api/admin/clusters/${cluster}/credentials`, {
      headers: CSRF,
      data: { name, description: null, token },
    }),
    `add credential ${name}`,
  );
  return ((await response.json()) as { id: string }).id;
}

async function grant(
  api: APIRequestContext,
  username: DevUser,
  cluster: string,
  credentialId: string,
  accessMode: 'readOnly' | 'readWrite',
): Promise<void> {
  if ((await api.get(`/api/admin/users/${username}`)).status() === 404) {
    await ok(await api.post('/api/admin/users', { headers: CSRF, data: { username } }), `create ${username}`);
  }
  await ok(
    await api.post('/api/admin/grants', {
      headers: CSRF,
      data: { username, clusterName: cluster, credentialId, accessMode },
    }),
    `grant ${username} on ${cluster}`,
  );
}

test.beforeAll(async ({ browser }, testInfo) => {
  ocp = await startFakeComputeApi({ openShift: true });
  k8s = await startFakeComputeApi({ openShift: false });
  adminContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await adminContext.newPage();
  await page.goto('/login');
  await loginAs(page, 'e2e-admin');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  const api = adminContext.request;

  const suffix = Date.now().toString(36);
  ocpCluster = `e2e-smoke-cmp-ocp-${suffix}`;
  k8sCluster = `e2e-smoke-cmp-k8s-${suffix}`;
  await registerCluster(api, ocpCluster, OCP_DISPLAY_NAME, ocp.url, 'openShift');
  await registerCluster(api, k8sCluster, K8S_DISPLAY_NAME, k8s.url, 'kubernetes');
  const editor = await addCredential(api, ocpCluster, EDITOR_SA, EDITOR_TOKEN);
  const viewer = await addCredential(api, ocpCluster, VIEWER_SA, VIEWER_TOKEN);
  await grant(api, RW_USER, ocpCluster, editor, 'readWrite');
  await grant(api, RO_USER, ocpCluster, viewer, 'readOnly');
  const k8sEditor = await addCredential(api, k8sCluster, EDITOR_SA, EDITOR_TOKEN);
  await grant(api, RW_USER, k8sCluster, k8sEditor, 'readWrite');
});

test.afterAll(async () => {
  try {
    await deleteCluster(adminContext.request, ocpCluster);
    await deleteCluster(adminContext.request, k8sCluster);
  } finally {
    await adminContext.close();
    await ocp.close();
    await k8s.close();
  }
});

test.beforeEach(() => {
  ocp.reset();
  k8s.reset();
});

test.afterEach(() => {
  const testInfo = test.info();
  // Requests the fakes did not serve explain most UI failures; attached to the report only when a test failed.
  if (testInfo.status !== testInfo.expectedStatus) {
    void testInfo.attach('fake-api-unknown-requests', {
      body: [...ocp.unknown.map((u) => `ocp ${u}`), ...k8s.unknown.map((u) => `k8s ${u}`)].join('\n'),
      contentType: 'text/plain',
    });
  }
});

test.describe('Nodes', () => {
  test('NODE-5: RW marks a node unschedulable in a modal naming the cluster, then schedulable again', async ({
    page,
  }) => {
    await openAs(page, RW_USER, nodePath(ocpCluster));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(WORKER_NODE);
    await expect(page.getByText('Scheduling disabled')).toHaveCount(0);

    await page.getByRole('button', { name: 'Actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Mark as schedulable' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Mark as unschedulable' }).click();
    const dialog = page.getByRole('dialog', { name: /Mark as unschedulable/ });
    await expect(dialog).toContainText(OCP_DISPLAY_NAME);
    await dialog.getByRole('button', { name: 'Mark unschedulable' }).click();

    await expect(
      page.getByText(`${WORKER_NODE} marked as unschedulable on ${OCP_DISPLAY_NAME}`),
    ).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Scheduling disabled').first()).toBeVisible();

    await page.getByRole('button', { name: 'Actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Mark as unschedulable' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Mark as schedulable' }).click();
    // No modal for the safe direction (OCP): it writes at once and toasts.
    await expect(page.getByText(`${WORKER_NODE} marked as schedulable on ${OCP_DISPLAY_NAME}`)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Scheduling disabled')).toHaveCount(0);

    expect(
      mutations(ocp).map((r) => [r.method, r.path, r.contentType?.split(';')[0], r.body, r.token]),
    ).toEqual([
      [
        'PATCH',
        `/api/v1/nodes/${WORKER_NODE}`,
        'application/json-patch+json',
        [{ op: 'add', path: '/spec/unschedulable', value: true }],
        EDITOR_TOKEN,
      ],
      [
        'PATCH',
        `/api/v1/nodes/${WORKER_NODE}`,
        'application/json-patch+json',
        [{ op: 'remove', path: '/spec/unschedulable' }],
        EDITOR_TOKEN,
      ],
    ]);
    expect(ocp.object('nodes', WORKER_NODE)?.spec?.unschedulable).toBeUndefined();
  });

  test('NODE-5: a read-only grant disables Mark as unschedulable with the reason and writes nothing', async ({
    page,
  }) => {
    await openAs(page, RO_USER, nodePath(ocpCluster));
    await page.getByRole('button', { name: 'Actions' }).click();
    const item = page.getByRole('menuitem', { name: 'Mark as unschedulable' });
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await item.hover();
    await expect(page.getByRole('tooltip')).toContainText(/is read-only/);
    await item.click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(mutations(ocp)).toEqual([]);
    expect(ocp.requests.every((r) => r.token === VIEWER_TOKEN)).toBe(true);
  });

  test("NODE-4: the Pods tab lists only the node's pods by field selector, counts non-DaemonSet pods and can hide DaemonSet pods", async ({
    page,
  }) => {
    await openAs(page, RW_USER, nodePath(ocpCluster, '/pods'));
    const link = (name: string) => page.getByRole('link', { name, exact: true });
    await expect(link(REPLICASET_POD)).toBeVisible();
    await expect(link(DAEMONSET_POD)).toBeVisible();
    await expect(link(BARE_POD)).toBeVisible();
    await expect(link(OTHER_NODE_POD)).toHaveCount(0);
    await expect(page.getByText('3 pods (2 not managed by a DaemonSet)')).toBeVisible();
    const podLists = ocp.requests.filter((r) => r.method === 'GET' && r.path === '/api/v1/pods');
    expect(podLists.length).toBeGreaterThan(0);
    expect(podLists.every((r) => r.query.get('fieldSelector') === `spec.nodeName=${WORKER_NODE}`)).toBe(true);

    // The bare pod warns that drain deletes it for good (NODE-4).
    await page
      .getByRole('row')
      .filter({ has: link(BARE_POD) })
      .getByRole('button', { name: /No owner/ })
      .click();
    await expect(page.getByRole('dialog', { name: 'No owner' })).toContainText(
      /Draining the node deletes it/,
    );
    await page.keyboard.press('Escape');

    // The (fleet) Owner filter: pick the Owner category in the toolbar, then the checkbox option.
    await page.getByRole('button', { name: 'Name', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Owner' }).click();
    await page.getByRole('button', { name: 'Filter by owner' }).click();
    await page.getByRole('checkbox', { name: 'Exclude DaemonSet pods' }).click();
    await expect(link(DAEMONSET_POD)).toHaveCount(0);
    await expect(link(REPLICASET_POD)).toBeVisible();
    await expect(link(BARE_POD)).toBeVisible();
  });

  test('NODE-3/T-0369: node details show the Images section with the tag name and size', async ({ page }) => {
    await openAs(page, RW_USER, nodePath(ocpCluster));
    const images = page.getByRole('grid', { name: 'Images' }).or(page.getByRole('table', { name: 'Images' }));
    await expect(images).toContainText(NODE_IMAGE);
    await expect(images).toContainText('quay.io/e2e/web:1.0');
    await expect(images).not.toContainText('sha256:');
  });

  test('NODE-1/MS-1/OLM-1: Compute lists Nodes, Machines, MachineSets and Operators has Installed Operators on OpenShift; Kubernetes shows Nodes only', async ({
    page,
  }) => {
    await openAs(page, RW_USER, nodePath(ocpCluster));
    expect(await sectionLinks(page, 'Compute')).toEqual(['Nodes', 'Machines', 'MachineSets']);
    expect(await sectionLinks(page, 'Operators')).toEqual(['Installed Operators']);

    await page.goto(nodePath(k8sCluster));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(WORKER_NODE);
    expect(await sectionLinks(page, 'Compute')).toEqual(['Nodes']);
    await expect(
      page
        .getByRole('navigation', { name: 'Global' })
        .getByRole('button', { name: 'Operators', exact: true }),
    ).toHaveCount(0);
  });
});

test.describe('Overview', () => {
  test('OVW-1..5: the OpenShift Overview renders Details, Status, Inventory and Activity from the cluster', async ({
    page,
  }) => {
    await openAs(page, RW_USER, `/c/${ocpCluster}/overview`);
    const card = (title: string) =>
      page
        .locator('.pf-v6-c-card')
        .filter({ has: page.locator('.pf-v6-c-card__title', { hasText: new RegExp(`^${title}`) }) });

    const details = card('Details');
    await expect(details).toContainText(API_SERVER_URL);
    await expect(details).toContainText(CLUSTER_ID);
    await expect(details).toContainText(OPENSHIFT_VERSION);
    await expect(details).toContainText(UPDATE_CHANNEL);
    await expect(details).toContainText('AWS');
    await expect(details).not.toContainText('Kubernetes version');

    const statusCard = card('Status');
    await expect(statusCard).toContainText('Cluster');
    await expect(statusCard).toContainText('Operators');
    // OCP's status card has no Nodes item on OpenShift (only on Kubernetes, OVW-2).
    await expect(statusCard).not.toContainText('Nodes');
    await expect(page.getByText('A cluster version update is available')).toBeVisible();

    const inventory = card('Cluster inventory');
    await expect(inventory.getByRole('link', { name: /^2 Nodes?$/ })).toBeVisible();
    await expect(inventory.getByRole('link', { name: /^4 Pods?$/ })).toBeVisible();

    await expect(card('Activity')).toContainText(EVENT_MESSAGE);

    // OVW-4: every inventory count is one `limit`ed list, never paginated.
    const podCounts = ocp.requests.filter((r) => r.path === '/api/v1/pods' && r.query.has('limit'));
    expect(podCounts.length).toBeGreaterThan(0);
    expect(podCounts.every((r) => r.query.get('limit') === '500' && !r.query.has('continue'))).toBe(true);
    expect(ocp.requests.every((r) => r.token === EDITOR_TOKEN)).toBe(true);
  });

  test('OVW-2: on prod-k8s-1 the Overview shows the Kubernetes version and no ClusterVersion or Operators items', async ({
    page,
  }) => {
    await openAs(page, RW_USER, `/c/${k8sCluster}/overview`);
    const card = (title: string) =>
      page
        .locator('.pf-v6-c-card')
        .filter({ has: page.locator('.pf-v6-c-card__title', { hasText: new RegExp(`^${title}`) }) });

    const details = card('Details');
    await expect(details).toContainText('Kubernetes version');
    await expect(details).toContainText(KUBERNETES_VERSION);
    await expect(details).not.toContainText('Cluster ID');
    await expect(details).not.toContainText('Update channel');
    await expect(details).not.toContainText('OpenShift version');

    const statusCard = card('Status');
    await expect(statusCard).toContainText('Nodes');
    await expect(statusCard).not.toContainText('Operators');
    await expect(page.getByText('A cluster version update is available')).toHaveCount(0);
    await expect(card('Cluster inventory').getByRole('link', { name: /^2 Nodes?$/ })).toBeVisible();
    await expect(card('Activity')).toContainText(EVENT_MESSAGE);
    // Discovery hides the OpenShift reads entirely: nothing asked for config.openshift.io.
    expect(k8s.requests.filter((r) => r.path.startsWith('/apis/config.openshift.io'))).toEqual([]);
  });
});

test.describe('Installed Operators', () => {
  test('OLM-1: All projects lists each operator once via labelSelector=!olm.copiedFrom', async ({ page }) => {
    await openAs(page, RW_USER, `/c/${ocpCluster}/k8s/all-namespaces/clusterserviceversions`);
    await expect(page.getByRole('heading', { level: 1, name: 'Installed Operators' })).toBeVisible();
    const table = page.getByRole('grid', { name: 'ClusterServiceVersions' });
    await expect(table.getByRole('link', { name: new RegExp(`^${CSV_DISPLAY_NAME}`) })).toHaveCount(1);
    await expect(table.getByRole('link', { name: new RegExp(`^${ORPHAN_CSV_DISPLAY_NAME}`) })).toHaveCount(1);
    await expect(table).toContainText('Succeeded');
    await expect(table).toContainText('Up to date');

    const csvLists = ocp.requests.filter(
      (r) => r.path === '/apis/operators.coreos.com/v1alpha1/clusterserviceversions',
    );
    expect(csvLists.length).toBeGreaterThan(0);
    expect(csvLists.every((r) => r.query.get('labelSelector') === '!olm.copiedFrom')).toBe(true);
  });

  test('OLM-3/5: CSV details render sanitised markdown and a data: icon, with no Edit or Delete', async ({
    page,
  }) => {
    await openAs(page, RW_USER, csvPath(CSV_NAME));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(CSV_DISPLAY_NAME);
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://etcd.io/docs');
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('main script')).toHaveCount(0);
    expect(await page.evaluate('typeof window.e2eXss')).toBe('undefined');
    const srcs = await Promise.all(
      (await page.locator('img').all()).map(async (img) => (await img.getAttribute('src')) ?? ''),
    );
    expect(srcs.filter((src) => src !== '' && !src.startsWith('data:') && !src.startsWith('/'))).toEqual([]);

    const actions = page.getByRole('button', { name: 'Actions' });
    if ((await actions.count()) > 0) {
      await actions.click();
      await expect(page.getByRole('menuitem', { name: /^(Edit|Delete)/ })).toHaveCount(0);
    }
  });

  test('OLM-4: the Subscription tab shows channel, approval and catalog source; an orphan CSV has none', async ({
    page,
  }) => {
    await openAs(page, RW_USER, csvPath(CSV_NAME, '/subscription'));
    const main = page.getByRole('main');
    await expect(main).toContainText(SUBSCRIPTION_CHANNEL);
    await expect(main).toContainText('Automatic');
    await expect(main).toContainText(CATALOG_SOURCE);
    await expect(main.getByRole('link', { name: CSV_NAME })).toBeVisible();

    await page.goto(csvPath(ORPHAN_CSV_NAME, '/subscription'));
    await expect(page.getByText('No Operator Subscription')).toBeVisible();
  });
});
