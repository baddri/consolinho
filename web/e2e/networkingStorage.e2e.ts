import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import {
  EXPANDABLE_PVC,
  SECURED_ROUTE,
  SECURED_ROUTE_HOST,
  SHOP_NAMESPACE,
  startFakeNetworkingStorageApi,
  UNSAFE_ROUTE,
  UNSAFE_ROUTE_HOST,
  WILDCARD_ROUTE,
  WILDCARD_ROUTE_HOST,
  type FakeNetworkingStorageApi,
} from './support/fakeNetworkingStorageApi';
import { EDITOR_SA, fakeServiceAccountToken, VIEWER_SA, type RecordedRequest } from './support/fakeWorkloadsApi';
import { CSRF, deleteCluster, loginAs, ok, type DevUser } from './support/session';

/**
 * QG5A-2 (CP5a, T-0311): Routes link-out, Expand PVC, Create Project and discovery-driven navigation end to end —
 * browser → Vite → Api proxy (grant token, mutation guard) → stateful fake API servers. The spec registers two
 * clusters (the `e2e-smoke-` prefix, so global setup sweeps leftovers): an **OpenShift** one (discovery serves
 * `route.openshift.io` and `project.openshift.io`; `bob` read-write with the editor SA, `alice` read-only with the
 * viewer SA) and a **vanilla Kubernetes** one standing in for the spec's `prod-k8s-1` (`bob` read-write). Each test
 * starts from the seeded objects and asserts the UI and what reached the cluster, with which token (SAFE5-3).
 */

const OCP_DISPLAY_NAME = 'E2E OpenShift';
const K8S_DISPLAY_NAME = 'E2E prod-k8s-1';
const RW_USER: DevUser = 'bob';
const RO_USER: DevUser = 'alice';
const EDITOR_TOKEN = fakeServiceAccountToken(EDITOR_SA);
const VIEWER_TOKEN = fakeServiceAccountToken(VIEWER_SA);
const NEW_PROJECT = 'e2e-new-project';

let ocp: FakeNetworkingStorageApi;
let k8s: FakeNetworkingStorageApi;
let adminContext: BrowserContext;
let ocpCluster = '';
let k8sCluster = '';

const pvcPath = () => `/c/${ocpCluster}/k8s/ns/${SHOP_NAMESPACE}/persistentvolumeclaims/${EXPANDABLE_PVC}`;
const routesPath = () => `/c/${ocpCluster}/k8s/ns/${SHOP_NAMESPACE}/routes`;
const projectsPath = (cluster: string) => `/c/${cluster}/k8s/cluster/projects`;

/** The mutating requests (PATCH/POST/DELETE) a fake received, SSARs excluded. */
const mutations = (fake: FakeNetworkingStorageApi): RecordedRequest[] =>
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
        description: 'Playwright CP5a networking/storage (T-0311); deleted after the run.',
        caBundle: null,
        skipTlsVerify: true,
      },
    }),
    `register ${name}`,
  );
}

async function addCredential(api: APIRequestContext, cluster: string, name: string, token: string): Promise<string> {
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
  ocp = await startFakeNetworkingStorageApi({ openShift: true });
  k8s = await startFakeNetworkingStorageApi({ openShift: false });
  adminContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await adminContext.newPage();
  await page.goto('/login');
  await loginAs(page, 'e2e-admin');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  const api = adminContext.request;

  const suffix = Date.now().toString(36);
  ocpCluster = `e2e-smoke-ocp-${suffix}`;
  k8sCluster = `e2e-smoke-k8s-${suffix}`;
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

test.describe('read-write user on an OpenShift cluster', () => {
  test('RT-2: an admitted secured Route links to its https URL in a new tab; wildcard and unsafe hosts are text', async ({
    page,
  }) => {
    await openAs(page, RW_USER, routesPath());
    const row = (name: string) =>
      page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) });

    const link = row(SECURED_ROUTE).getByRole('link', { name: new RegExp(`^https://${SECURED_ROUTE_HOST}`) });
    await expect(link).toHaveAttribute('href', `https://${SECURED_ROUTE_HOST}`);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /\bnoopener\b/);

    // Exactly one link per unsafe row: the Route's own name; the host is plain text.
    await expect(row(WILDCARD_ROUTE)).toContainText(WILDCARD_ROUTE_HOST);
    await expect(row(WILDCARD_ROUTE).getByRole('link', { name: WILDCARD_ROUTE_HOST })).toHaveCount(0);
    await expect(row(UNSAFE_ROUTE)).toContainText(UNSAFE_ROUTE_HOST);
    await expect(row(UNSAFE_ROUTE).getByRole('link', { name: UNSAFE_ROUTE_HOST })).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('PVC-3: Expand PVC grows db-data from 10Gi to 20Gi with one JSON Patch and the grant token', async ({
    page,
  }) => {
    await openAs(page, RW_USER, pvcPath());
    await page.getByRole('button', { name: 'Actions' }).click();
    const item = page.getByRole('menuitem', { name: 'Expand PVC' });
    await expect(item).not.toHaveAttribute('aria-disabled', 'true');
    await item.click();

    const dialog = page.getByRole('dialog', { name: 'Expand PersistentVolumeClaim' });
    // SAFE5-1: the modal names the claim's namespace and the production cluster with its environment label.
    await expect(dialog).toContainText(`in ${SHOP_NAMESPACE} on ${OCP_DISPLAY_NAME}`);
    await expect(dialog.getByText('prod', { exact: true })).toBeVisible();
    const size = dialog.getByRole('spinbutton', { name: 'Total size' });
    await expect(size).toHaveValue('10');
    await size.fill('20');
    await dialog.getByRole('button', { name: 'Expand' }).click();

    await expect(page.getByText(`Expansion of ${EXPANDABLE_PVC} to 20Gi requested on ${OCP_DISPLAY_NAME}`)).toBeVisible();
    await expect(dialog).toBeHidden();
    const capacity = page.locator('dt', { hasText: /^Capacity$/ }).locator('xpath=following-sibling::dd[1]');
    await expect(capacity).toHaveText(/20 GiB/);
    expect(mutations(ocp).map((r) => [r.method, r.path, r.contentType?.split(';')[0], r.body, r.token])).toEqual([
      [
        'PATCH',
        `/api/v1/namespaces/${SHOP_NAMESPACE}/persistentvolumeclaims/${EXPANDABLE_PVC}`,
        'application/json-patch+json',
        [{ op: 'replace', path: '/spec/resources/requests', value: { storage: '20Gi' } }],
        EDITOR_TOKEN,
      ],
    ]);
  });

  test('PRJ-2: Create Project posts a ProjectRequest and lands on the new project', async ({ page }) => {
    await openAs(page, RW_USER, projectsPath(ocpCluster));
    const button = page.getByRole('button', { name: 'Create Project' });
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Create Project' });
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(NEW_PROJECT);
    await dialog.getByRole('textbox', { name: 'Display name' }).fill('New project');
    await expect(dialog).toContainText(OCP_DISPLAY_NAME);
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(new RegExp(`${projectsPath(ocpCluster)}/${NEW_PROJECT}$`));
    await expect(page.getByText(`Project ${NEW_PROJECT} created on ${OCP_DISPLAY_NAME}`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/New project|e2e-new-project/);
    const posts = mutations(ocp);
    expect(posts.map((r) => [r.method, r.path, r.token])).toEqual([
      ['POST', '/apis/project.openshift.io/v1/projectrequests', EDITOR_TOKEN],
    ]);
    expect(posts[0]?.body).toMatchObject({
      kind: 'ProjectRequest',
      metadata: { name: NEW_PROJECT },
      displayName: 'New project',
    });
  });

  test('NAV-1: Storage lists PersistentVolumes, PersistentVolumeClaims, StorageClasses; Networking has Routes', async ({
    page,
  }) => {
    await openAs(page, RW_USER, routesPath());
    expect(await sectionLinks(page, 'Storage')).toEqual([
      'PersistentVolumes',
      'PersistentVolumeClaims',
      'StorageClasses',
    ]);
    expect(await sectionLinks(page, 'Networking')).toEqual(['Services', 'Routes', 'Ingresses', 'NetworkPolicies']);
  });
});

test.describe('read-only user on an OpenShift cluster', () => {
  test('SAFE5-2: Expand PVC is aria-disabled with the read-only reason and sends nothing', async ({ page }) => {
    await openAs(page, RO_USER, pvcPath());
    await page.getByRole('button', { name: 'Actions' }).click();
    const item = page.getByRole('menuitem', { name: 'Expand PVC' });
    await expect(item).toHaveAttribute('aria-disabled', 'true');
    await item.hover();
    await expect(page.getByText(`Your access to ${ocpCluster} is read-only.`)).toBeVisible();
    await item.click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(mutations(ocp)).toEqual([]);
  });

  test('SAFE5-2: Create Project is aria-disabled with the read-only reason and sends nothing', async ({ page }) => {
    await openAs(page, RO_USER, projectsPath(ocpCluster));
    const button = page.getByRole('button', { name: 'Create Project' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await button.hover();
    await expect(page.getByText(`Your access to ${ocpCluster} is read-only.`)).toBeVisible();
    await button.click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(mutations(ocp)).toEqual([]);
  });
});

test.describe('vanilla Kubernetes cluster (prod-k8s-1)', () => {
  test('NAV-2 / PRJ-2: no Routes nav item and no Create Project; Storage stays', async ({ page }) => {
    await openAs(page, RW_USER, `/c/${k8sCluster}/k8s/ns/${SHOP_NAMESPACE}/persistentvolumeclaims`);
    await expect(page.getByRole('link', { name: EXPANDABLE_PVC, exact: true })).toBeVisible();
    expect(await sectionLinks(page, 'Networking')).toEqual(['Services', 'Ingresses', 'NetworkPolicies']);
    expect(await sectionLinks(page, 'Storage')).toEqual([
      'PersistentVolumes',
      'PersistentVolumeClaims',
      'StorageClasses',
    ]);
    const home = await sectionLinks(page, 'Home');
    expect(home).not.toContain('Projects');

    await page.goto(`/c/${k8sCluster}/k8s/cluster/namespaces`);
    await expect(page.getByRole('link', { name: SHOP_NAMESPACE, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Project' })).toHaveCount(0);
    expect(k8s.requests.some((r) => r.path.includes('route.openshift.io') || r.path.includes('project.openshift.io'))).toBe(
      false,
    );
  });
});
