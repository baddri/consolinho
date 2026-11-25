import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { FAKE_KUBERNETES_VERSION, FAKE_OPENSHIFT_VERSION } from './support/fakeClusterHealth';
import { closedPortUrl, startFakeFleetCluster, type FakeFleetCluster } from './support/fakeFleetCluster';
import { fakeServiceAccountToken } from './support/fakeWorkloadsApi';
import { CSRF, deleteCluster, loginAs, ok, type DevUser } from './support/session';

/**
 * QG5C-2 (CP5c, T-0344): the Fleet overview end to end — browser → Vite → Api `GET /api/fleet/status` (NDJSON, probes
 * with the user's grant token) → fake API servers. The spec registers eight `e2e-smoke-fleet-*` clusters (global setup
 * sweeps leftovers) and grants six of them to the grantless `e2e-user` (no groups, so the visible set is exactly
 * those): healthy OpenShift (read-write), healthy Kubernetes (read-only), unreachable (closed port), token invalid
 * (401), Restricted (ClusterOperators 403) and Degraded (a NotReady node). A seventh is granted only to `alice` and an
 * eighth to `e2e-user` but disabled; neither may appear. Deleting the clusters afterwards revokes the grants, so
 * `e2e-user` is grantless again for H4.
 */

const USER: DevUser = 'e2e-user';
const OTHER_USER: DevUser = 'alice';

interface FleetCluster {
  name: string;
  displayName: string;
  token: string;
}

let adminContext: BrowserContext;
let healthy: FakeFleetCluster;
let unauthorized: FakeFleetCluster;
let restricted: FakeFleetCluster;
let degraded: FakeFleetCluster;
const clusters: Record<
  'ocp' | 'k8s' | 'down' | 'tokenInvalid' | 'restricted' | 'degraded' | 'hidden' | 'disabled',
  FleetCluster
> = {} as never;

/** The wide viewport shows the `2xl`-only columns (Update, Environment, Type, Access). */
test.use({ viewport: { width: 1600, height: 1000 } });

async function register(
  api: APIRequestContext,
  cluster: FleetCluster,
  apiUrl: string,
  distribution: 'openShift' | 'kubernetes',
  environment: 'production' | 'staging' | 'development',
): Promise<string> {
  await ok(
    await api.post('/api/admin/clusters', {
      headers: CSRF,
      data: {
        name: cluster.name,
        displayName: cluster.displayName,
        apiUrl,
        environment,
        distribution,
        webConsoleUrl: null,
        description: 'Playwright CP5c fleet overview (T-0344); deleted after the run.',
        caBundle: null,
        skipTlsVerify: true,
      },
    }),
    `register ${cluster.name}`,
  );
  const credential = await ok(
    await api.post(`/api/admin/clusters/${cluster.name}/credentials`, {
      headers: CSRF,
      data: { name: 'e2e-fleet', description: null, token: cluster.token },
    }),
    `add credential on ${cluster.name}`,
  );
  return ((await credential.json()) as { id: string }).id;
}

async function grant(
  api: APIRequestContext,
  username: DevUser,
  cluster: FleetCluster,
  credentialId: string,
  accessMode: 'readOnly' | 'readWrite',
): Promise<void> {
  if ((await api.get(`/api/admin/users/${username}`)).status() === 404) {
    await ok(await api.post('/api/admin/users', { headers: CSRF, data: { username } }), `create ${username}`);
  }
  await ok(
    await api.post('/api/admin/grants', {
      headers: CSRF,
      data: { username, clusterName: cluster.name, credentialId, accessMode },
    }),
    `grant ${username} on ${cluster.name}`,
  );
}

test.beforeAll(async ({ browser }, testInfo) => {
  [healthy, unauthorized, restricted, degraded] = await Promise.all([
    startFakeFleetCluster('healthy'),
    startFakeFleetCluster('tokenInvalid'),
    startFakeFleetCluster('operatorsForbidden'),
    startFakeFleetCluster('nodeNotReady'),
  ]);
  const suffix = Date.now().toString(36);
  const define = (key: keyof typeof clusters, displayName: string) => {
    const name = `e2e-smoke-fleet-${key.toLowerCase()}-${suffix}`;
    clusters[key] = { name, displayName, token: fakeServiceAccountToken(`fleet-${key.toLowerCase()}`) };
  };
  define('ocp', 'E2E Fleet healthy');
  define('k8s', 'E2E Fleet k8s');
  define('down', 'E2E Fleet down');
  define('tokenInvalid', 'E2E Fleet expired');
  define('restricted', 'E2E Fleet restricted');
  define('degraded', 'E2E Fleet degraded');
  define('hidden', 'E2E Fleet not granted');
  define('disabled', 'E2E Fleet disabled');

  adminContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await adminContext.newPage();
  await page.goto('/login');
  await loginAs(page, 'e2e-admin');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  const api = adminContext.request;

  const setUp: [
    keyof typeof clusters,
    string,
    'openShift' | 'kubernetes',
    'production' | 'staging' | 'development',
  ][] = [
    ['ocp', healthy.url, 'openShift', 'production'],
    ['k8s', healthy.url, 'kubernetes', 'staging'],
    ['down', await closedPortUrl(), 'openShift', 'development'],
    ['tokenInvalid', unauthorized.url, 'openShift', 'production'],
    ['restricted', restricted.url, 'openShift', 'staging'],
    ['degraded', degraded.url, 'openShift', 'production'],
    ['hidden', healthy.url, 'openShift', 'production'],
    ['disabled', healthy.url, 'openShift', 'production'],
  ];
  for (const [key, url, distribution, environment] of setUp) {
    const credential = await register(api, clusters[key], url, distribution, environment);
    if (key === 'hidden') await grant(api, OTHER_USER, clusters[key], credential, 'readWrite');
    else await grant(api, USER, clusters[key], credential, key === 'k8s' ? 'readOnly' : 'readWrite');
  }
  const path = `/api/admin/clusters/${clusters.disabled.name}`;
  const { version } = (await (await ok(await api.get(path), `GET ${path}`)).json()) as { version: number };
  await ok(await api.post(`${path}/disable`, { headers: CSRF, data: { version } }), 'disable');
});

test.afterAll(async () => {
  try {
    for (const cluster of Object.values(clusters)) await deleteCluster(adminContext.request, cluster.name);
  } finally {
    await adminContext.close();
    await Promise.all([healthy, unauthorized, restricted, degraded].map((fake) => fake.close()));
  }
});

test.beforeEach(() => {
  for (const fake of [healthy, unauthorized, restricted, degraded]) fake.reset();
});

const sidebar = (page: Page): Locator => page.getByRole('navigation', { name: 'Global' });

/** The fleet table's data rows. */
const dataRows = (page: Page): Locator =>
  page
    .getByRole('grid')
    .or(page.getByRole('table'))
    .getByRole('row')
    .filter({ has: page.getByRole('link') });

/** The row whose Name link is `cluster`'s display name. */
const rowOf = (page: Page, cluster: FleetCluster): Locator =>
  page.getByRole('row').filter({ has: page.getByRole('link', { name: cluster.displayName, exact: true }) });

/** Logs `USER` in and opens the Fleet overview from the switcher's "Fleet management" entry. */
async function openFleetFromSwitcher(page: Page): Promise<void> {
  await page.goto('/');
  await loginAs(page, USER);
  await expect(page).toHaveURL(/\/c\/[^/]+/);
  await sidebar(page)
    .getByRole('button', { name: /switch cluster$/ })
    .click();
  await page.getByRole('option', { name: 'Fleet management' }).click();
  await expect(page).toHaveURL(/\/fleet\/overview$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Fleet overview' })).toBeVisible();
}

test.describe('non-admin user', () => {
  test('QG5C-2: sees only granted, enabled clusters with their status; unreachable never blocks the rest', async ({
    page,
  }) => {
    const statusResponse = page.waitForResponse((response) => response.url().endsWith('/api/fleet/status'));
    await openFleetFromSwitcher(page);

    // FLT-1: the Fleet section, no Fleet administration.
    await expect(sidebar(page).getByRole('button', { name: 'Fleet', exact: true })).toBeVisible();
    await expect(sidebar(page).getByRole('button', { name: 'Fleet administration' })).toHaveCount(0);

    // FLT-4 / FLT-5 default sort: Unreachable, Token invalid, Degraded, Restricted, Healthy (then display name).
    const expected = ['down', 'tokenInvalid', 'degraded', 'restricted', 'ocp', 'k8s'] as const;
    await expect(rowOf(page, clusters.k8s)).toContainText('Healthy');
    await expect(rowOf(page, clusters.down)).toContainText('Unreachable');
    await expect(dataRows(page).getByRole('link', { name: /^E2E Fleet/ })).toHaveText(
      expected.map((key) => clusters[key].displayName),
    );
    // FBE-7 / FLT-2: neither the cluster granted to someone else nor the disabled one.
    await expect(page.getByRole('link', { name: clusters.hidden.displayName })).toHaveCount(0);
    await expect(page.getByRole('link', { name: clusters.disabled.displayName })).toHaveCount(0);

    // FLT-4 statuses and FLT-3 cells.
    await expect(rowOf(page, clusters.down)).toContainText('Connection failed');
    await expect(rowOf(page, clusters.tokenInvalid)).toContainText('Token invalid');
    const degradedRow = rowOf(page, clusters.degraded);
    await expect(degradedRow).toContainText('Degraded');
    await expect(degradedRow.getByRole('link', { name: '2 of 3 Ready' })).toBeVisible();
    await expect(degradedRow).toContainText('1 Not Ready');
    const restrictedRow = rowOf(page, clusters.restricted);
    await expect(restrictedRow).toContainText(FAKE_OPENSHIFT_VERSION);
    await restrictedRow.getByText('Restricted', { exact: true }).first().hover();
    await expect(page.getByRole('tooltip')).toContainText(/ClusterOperators/);

    const ocpRow = rowOf(page, clusters.ocp);
    await expect(ocpRow).toContainText(FAKE_OPENSHIFT_VERSION);
    await expect(ocpRow).toContainText('Up to date');
    await expect(ocpRow.getByRole('link', { name: 'All available' })).toHaveAttribute(
      'href',
      new RegExp(`/c/${clusters.ocp.name}/.*clusteroperators`),
    );
    await expect(ocpRow.getByRole('link', { name: '3 of 3 Ready' })).toHaveAttribute(
      'href',
      new RegExp(`/c/${clusters.ocp.name}/.*nodes`),
    );
    await expect(ocpRow.getByText('Read only', { exact: true })).toHaveCount(0);
    const k8sRow = rowOf(page, clusters.k8s);
    await expect(k8sRow).toContainText(FAKE_KUBERNETES_VERSION);
    await expect(k8sRow.getByText('Read only', { exact: true })).toBeVisible();

    // FLT-5 summary line.
    const summary = page.getByRole('group', { name: 'Fleet summary' });
    await expect(summary).toHaveText(/6 clusters\s*·\s*1 degraded\s*·\s*1 unreachable\s*·\s*0 updating/);

    // FBE-2: each probe used the grant credential of its own cluster; nothing used the other user's or the disabled
    // cluster's token. FBE-6: no token or upstream error text in the stream.
    const tokensSeen = (fake: FakeFleetCluster) => new Set(fake.requests.map((request) => request.token));
    expect(tokensSeen(healthy)).toEqual(new Set([clusters.ocp.token, clusters.k8s.token]));
    expect(tokensSeen(restricted)).toEqual(new Set([clusters.restricted.token]));
    expect(
      healthy.requests
        .filter((r) => r.token === clusters.k8s.token)
        .map((r) => r.path)
        .sort(),
    ).toEqual(['/api/v1/nodes', '/version']);
    const body = await (await statusResponse).text();
    for (const cluster of Object.values(clusters)) expect(body).not.toContain(cluster.token);
    expect(body).not.toContain('fake API:');
    expect(body.trim().split('\n')).toHaveLength(6);
  });

  test('FLT-5/7: summary links filter by status; a filter matching nothing offers "Clear filters"', async ({
    page,
  }) => {
    await openFleetFromSwitcher(page);
    await expect(rowOf(page, clusters.k8s)).toContainText('Healthy');

    await page
      .getByRole('group', { name: 'Fleet summary' })
      .getByRole('button', { name: '1 unreachable' })
      .click();
    await expect(page).toHaveURL(/[?&]status=unreachable\b/);
    await expect(dataRows(page)).toHaveCount(1);
    await expect(rowOf(page, clusters.down)).toBeVisible();

    await page
      .getByRole('group', { name: 'Fleet summary' })
      .getByRole('button', { name: '6 clusters' })
      .click();
    await expect(dataRows(page)).toHaveCount(6);

    await page.getByPlaceholder('Filter by name').fill('no-such-cluster');
    await expect(dataRows(page)).toHaveCount(0);
    await expect(page.getByText('No clusters found')).toBeVisible();
    // The shared toolbar's button reads "Clear filters", as PF DataView's default in OCP (UX.md §5 says "Clear all").
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(dataRows(page)).toHaveCount(6);
  });

  test("FLT-6/8: Refresh re-checks the fleet; a row name opens that cluster's Overview and records it as recent", async ({
    page,
  }) => {
    await openFleetFromSwitcher(page);
    await expect(rowOf(page, clusters.ocp)).toContainText('Healthy');
    await expect(page.getByText(/^Last checked/)).toBeVisible();

    const again = page.waitForRequest((request) => request.url().endsWith('/api/fleet/status'));
    await page.getByRole('button', { name: 'Refresh' }).click();
    await again;
    await expect(rowOf(page, clusters.ocp)).toContainText('Healthy');

    await rowOf(page, clusters.ocp)
      .getByRole('link', { name: clusters.ocp.displayName, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/c/${clusters.ocp.name}/overview$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(
      sidebar(page).getByRole('button', { name: new RegExp(`^Cluster ${clusters.ocp.displayName} `) }),
    ).toBeVisible();
    // `web/src/features/cluster-context/useRecentClusters.ts` storage, newest first.
    const recent: unknown = await page.evaluate(
      `window.localStorage.getItem(${JSON.stringify(`fleetconsole.recentClusters.${USER}`)})`,
    );
    expect((JSON.parse(typeof recent === 'string' ? recent : '[]') as string[])[0]).toBe(clusters.ocp.name);
  });

  test('ADM-3: direct Fleet administration URLs still explain there is no access', async ({ page }) => {
    await page.goto('/fleet/admin/users');
    await loginAs(page, USER);
    await expect(
      page.getByRole('heading', { name: "You don't have access to Fleet administration" }),
    ).toBeVisible();
  });
});

test('QG5C-2: admin still sees Fleet administration; without grants the overview says "No clusters" (FLT-7)', async ({
  page,
}) => {
  await page.goto('/fleet');
  await loginAs(page, 'e2e-admin');
  await expect(page).toHaveURL(/\/fleet\/overview$/);
  await expect(sidebar(page).getByRole('button', { name: 'Fleet', exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: 'Fleet administration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No clusters' })).toBeVisible();
  await expect(
    page.getByText(/^You don't have access to any cluster\. Ask a .+ administrator for access\.$/),
  ).toBeVisible();
});
