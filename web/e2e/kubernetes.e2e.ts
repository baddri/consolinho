import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { addKindCredential, grantKind, readKindAccess, registerKindCluster } from './support/kind';
import { deleteCluster, loginAs, type DevUser } from './support/session';

/**
 * QG55B-3 (CP5.5b, T-0386): FleetConsole against a real vanilla Kubernetes (the local kind cluster of
 * `scripts/kind-dev.sh`, KIND-1/2). Opt-in, so default runs stay light: start kind with `scripts/kind-dev.sh up`, then
 * run with `E2E_KIND=1`.
 *
 * Setup registers kind as `e2e-smoke-kind-*` (global setup sweeps leftovers of aborted runs) with its CA bundle, adds
 * the seeded ServiceAccounts `fleet-viewer` (cluster `view`) and `team-a-editor` (`edit` in `team-a` only, inspect
 * namespace `team-a` = its fallback namespace, NSA-1) as credentials, and grants `fleet-viewer` read-only to
 * `e2e-admin` and `team-a-editor` read-write to `e2e-member`. Deleting the cluster afterwards revokes both grants, so
 * the reserved users are grantless again for H4. Tokens are read at runtime from `kind-dev.sh tokens` and kept in
 * memory only.
 */
test.skip(process.env.E2E_KIND !== '1', 'Needs a kind cluster: scripts/kind-dev.sh up, then E2E_KIND=1');

const ADMIN: DevUser = 'e2e-admin';
const MEMBER: DevUser = 'e2e-member';
const NAMESPACE = 'team-a';
const CONTAINER = 'nginx';
const cluster = `e2e-smoke-kind-${Date.now().toString(36)}`;

/** The admin's browser context (logged in), for seeding and cleanup through `context.request`. */
let adminContext: BrowserContext | undefined;

test.beforeAll(async ({ browser }, testInfo) => {
  const kind = readKindAccess();
  const baseURL = testInfo.project.use.baseURL ?? '';
  const context = await browser.newContext({ baseURL });
  adminContext = context;
  const page = await context.newPage();
  await page.goto('/login');
  await loginAs(page, ADMIN);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  const api = context.request;
  // Token-carrying calls bypass Playwright (see addKindCredential), so traces never hold a token.
  const session = { baseURL, cookies: (await context.storageState()).cookies };

  await registerKindCluster(api, cluster, kind);
  const viewer = await addKindCredential(session, cluster, kind, 'fleet-viewer');
  const editor = await addKindCredential(session, cluster, kind, 'team-a-editor', [NAMESPACE]);
  await grantKind(api, ADMIN, cluster, viewer, 'readOnly');
  await grantKind(api, MEMBER, cluster, editor, 'readWrite');
});

test.afterAll(async () => {
  if (!adminContext) return;
  try {
    await deleteCluster(adminContext.request, cluster);
  } finally {
    await adminContext.close();
  }
});

/** Opens `path` (redirects to the login page) and logs in as `user` through DevOAuth. */
async function openAs(page: Page, user: DevUser, path: string): Promise<void> {
  await page.goto(path);
  await loginAs(page, user);
  await page.waitForURL((url) => !url.pathname.startsWith('/login') && url.pathname.startsWith('/c/'));
}

/**
 * DSC-5 (DIST-6): a per-cluster screen on kind never says "OpenShift" or "Project". Waits for `ready` (the page's
 * content) first, so the check runs on the rendered page rather than a loading skeleton.
 */
async function expectNoOpenShiftWording(page: Page, ready: Locator): Promise<void> {
  await expect(ready).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('body')).not.toContainText(/OpenShift|Project/);
}

const sidebar = (page: Page): Locator => page.getByRole('navigation', { name: 'Global' });

/** The sidebar's link texts in one section, after expanding it. */
async function sectionLinks(page: Page, section: string): Promise<string[]> {
  const toggle = sidebar(page).getByRole('button', { name: section, exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const region = sidebar(page).getByRole('region', { name: section, exact: true });
  await expect(region.getByRole('link').first()).toBeVisible();
  return region.getByRole('link').allTextContents();
}

test('CT-2: the connection test of fleet-viewer shows the Kubernetes version and no OpenShift version', async ({
  page,
}) => {
  await page.goto('/login');
  await loginAs(page, ADMIN);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(`/fleet/admin/clusters/${cluster}/credentials`);
  const row = page
    .getByRole('grid', { name: `Credentials of ${cluster}` })
    .getByRole('row')
    .filter({ hasText: 'fleet-viewer' });
  await row.getByRole('button', { name: 'Kebab toggle' }).click();
  await page.getByRole('menuitem', { name: 'Test' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Run test' }).click();

  const facts = dialog.getByLabel('Cluster facts'); // a <dl>: no list role
  await expect(facts).toBeVisible({ timeout: 30_000 });
  await expect(facts).toContainText('Kubernetes version');
  await expect(facts).toContainText(/v1\.\d+/);
  await expect(facts).not.toContainText('OpenShift version');
  await expect(dialog.getByText('OpenShift version', { exact: true })).toHaveCount(0);
});

test('DSC-1/DSC-5: the kind sidebar lists exactly the served sections and items', async ({ page }) => {
  await openAs(page, ADMIN, `/c/${cluster}/overview`);
  await expectNoOpenShiftWording(page, page.getByText('Kubernetes version').first());

  const expected: [string, string[]][] = [
    ['Home', ['Overview', 'Search', 'Events']],
    [
      'Workloads',
      [
        'Pods',
        'Deployments',
        'StatefulSets',
        'Secrets',
        'ConfigMaps',
        'CronJobs',
        'Jobs',
        'DaemonSets',
        'ReplicaSets',
        'ReplicationControllers',
        'HorizontalPodAutoscalers',
      ],
    ],
    ['Networking', ['Services', 'Ingresses', 'NetworkPolicies']],
    ['Storage', ['PersistentVolumes', 'PersistentVolumeClaims', 'StorageClasses']],
    ['Compute', ['Nodes']],
    ['Administration', ['Namespaces']],
  ];
  // Section toggles in order. Favorites (starred pages, after Home as in OCP) is a user section, not a cluster one.
  const sectionToggles = sidebar(page).locator('button[aria-expanded]').filter({ hasNotText: cluster }); // the cluster switcher's toggle
  await expect
    .poll(async () => (await sectionToggles.allTextContents()).filter((title) => title !== 'Favorites'))
    .toEqual(expected.map(([title]) => title));
  for (const [section, items] of expected) {
    expect(await sectionLinks(page, section), section).toEqual(items);
  }
  await expect(sidebar(page)).not.toContainText(
    /Operators|Projects|Routes|DeploymentConfigs|Machine|Cluster Settings/,
  );

  await sidebar(page).getByRole('link', { name: 'Namespaces', exact: true }).click();
  await expectNoOpenShiftWording(page, page.getByRole('link', { name: NAMESPACE, exact: true }));
});

test('NSF-1/3/DSC-5: a token that cannot list namespaces lands in its configured namespace', async ({
  page,
}) => {
  await openAs(page, MEMBER, `/c/${cluster}`);
  await expect(page).toHaveURL(new RegExp(`/c/${cluster}/k8s/ns/${NAMESPACE}/pods$`));
  await expectNoOpenShiftWording(page, page.getByRole('link', { name: /^web-/ }).first());

  await page.getByRole('button', { name: `Namespace: ${NAMESPACE}` }).click();
  const menu = page.getByRole('listbox');
  await expect(menu.getByRole('option')).toHaveText([NAMESPACE]);
  await expect(menu).not.toContainText('All namespaces');
  await expect(
    page.getByText(
      "You can't list namespaces on this cluster. Showing the namespaces configured for your access.",
    ),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/OpenShift|Project/);
});

test('Logs and terminal/DSC-5: a kind web pod streams its log and runs a shell command', async ({ page }) => {
  await openAs(page, MEMBER, `/c/${cluster}/k8s/ns/${NAMESPACE}/pods`);
  const podLink = page.getByRole('link', { name: /^web-/ }).first();
  await expectNoOpenShiftWording(page, podLink);
  const pod = (await podLink.textContent()) ?? '';
  const podPath = `/c/${cluster}/k8s/ns/${NAMESPACE}/pods/${pod}`;

  await page.goto(`${podPath}/logs`);
  const panel = page.getByRole('tabpanel', { name: 'Logs' });
  // nginx's entrypoint and master process log these on start.
  await expect(panel.getByText(/start worker process|ready for start up/).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(panel.getByRole('button', { name: 'Pause event streaming' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/OpenShift|Project/);

  await page.goto(`${podPath}/terminal`);
  const terminal = page.getByRole('group', { name: `Terminal of container ${CONTAINER}` });
  await expect(terminal).toContainText(/[#$]/, { timeout: 20_000 });
  await terminal.click();
  await page.keyboard.type('echo ok');
  await page.keyboard.press('Enter');
  await expect(terminal).toContainText(/echo ok\s*ok/, { timeout: 10_000 });
  await expect(page.locator('body')).not.toContainText(/OpenShift|Project/);
});
