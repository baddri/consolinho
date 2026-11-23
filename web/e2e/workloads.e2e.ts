import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import {
  CONTAINER,
  DEPLOYMENT,
  EDITOR_SA,
  fakeServiceAccountToken,
  OLD_IMAGE,
  OLD_REPLICASET,
  POD,
  startFakeWorkloadsApi,
  VIEWER_SA,
  WORK_NAMESPACE,
  type FakeWorkloadsApi,
  type RecordedRequest,
} from './support/fakeWorkloadsApi';
import { CSRF, deleteCluster, loginAs, ok, type DevUser } from './support/session';

/**
 * QGA-2 (CP4a, T-0186): day-2 workload operations end to end — browser → Vite → Api proxy (grant token, mutation
 * guard, exec relay, log streaming) → a stateful fake API server. The spec registers its own **production**
 * Kubernetes cluster (the `e2e-smoke-` prefix, so global setup sweeps leftovers) with two credentials: `bob` gets a
 * read-write grant with the editor SA, `alice` a read-only grant with the viewer SA. Each test starts from the
 * seeded objects (`fake.reset()`) and asserts both the UI and what reached the cluster, with which token (SAFE-2).
 */

const DISPLAY_NAME = 'E2E Production';
const RW_USER: DevUser = 'bob';
const RO_USER: DevUser = 'alice';
const EDITOR_TOKEN = fakeServiceAccountToken(EDITOR_SA);
const VIEWER_TOKEN = fakeServiceAccountToken(VIEWER_SA);

let fake: FakeWorkloadsApi;
let adminContext: BrowserContext;
let cluster = '';

const deploymentPath = () => `/c/${cluster}/k8s/ns/${WORK_NAMESPACE}/deployments/${DEPLOYMENT}`;
const podPath = () => `/c/${cluster}/k8s/ns/${WORK_NAMESPACE}/pods/${POD}`;

/** The mutating requests (PATCH/POST/DELETE, exec upgrades) the fake cluster received, SSARs excluded. */
const mutations = (): RecordedRequest[] =>
  fake.requests.filter((r) => r.method !== 'GET' && !r.path.endsWith('/selfsubjectaccessreviews'));

/** Opens `path` (redirects to the login page) and logs in as `user` through DevOAuth. */
async function openAs(page: Page, user: DevUser, path: string): Promise<void> {
  await page.goto(path);
  await loginAs(page, user);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

/** Opens the details page's Actions menu and returns `name`'s item once its access check enabled it. */
async function enabledAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Actions' }).click();
  const item = page.getByRole('menuitem', { name });
  await expect(item).not.toHaveAttribute('aria-disabled', 'true');
  return item;
}

/** SAFE-1: the modal names the object, namespace and production cluster with its environment label. */
async function expectProductionContext(page: Page, title: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toContainText(`in ${WORK_NAMESPACE} on ${DISPLAY_NAME}`);
  await expect(dialog.getByText('prod', { exact: true })).toBeVisible();
}

test.beforeAll(async ({ browser }, testInfo) => {
  fake = await startFakeWorkloadsApi();
  adminContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await adminContext.newPage();
  await page.goto('/login');
  await loginAs(page, 'e2e-admin');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  const api = adminContext.request;

  cluster = `e2e-smoke-prod-${Date.now().toString(36)}`;
  await ok(
    await api.post('/api/admin/clusters', {
      headers: CSRF,
      data: {
        name: cluster,
        displayName: DISPLAY_NAME,
        apiUrl: fake.url,
        environment: 'production',
        distribution: 'kubernetes',
        webConsoleUrl: null,
        description: 'Playwright CP4a workloads (T-0186); deleted after the run.',
        caBundle: null,
        skipTlsVerify: true,
      },
    }),
    'register cluster',
  );
  const editor = await addCredential(api, EDITOR_SA, EDITOR_TOKEN);
  const viewer = await addCredential(api, VIEWER_SA, VIEWER_TOKEN);
  await grant(api, RW_USER, editor, 'readWrite');
  await grant(api, RO_USER, viewer, 'readOnly');
});

test.afterAll(async () => {
  try {
    await deleteCluster(adminContext.request, cluster);
  } finally {
    await adminContext.close();
    await fake.close();
  }
});

test.beforeEach(() => fake.reset());

test.afterEach(() => {
  const testInfo = test.info();
  // Requests the fake did not serve explain most UI failures; attached to the report only when a test failed.
  if (testInfo.status !== testInfo.expectedStatus) {
    void testInfo.attach('fake-api-unknown-requests', { body: fake.unknown.join('\n'), contentType: 'text/plain' });
  }
});

test.describe('read-write user on a production cluster', () => {
  test('ACT-2: Edit labels names the production cluster, sends one JSON Patch and shows the label', async ({
    page,
  }) => {
    await openAs(page, RW_USER, deploymentPath());
    await (await enabledAction(page, 'Edit labels')).click();
    await expectProductionContext(page, 'Edit labels');
    const dialog = page.getByRole('dialog', { name: 'Edit labels' });
    await dialog.getByRole('textbox', { name: 'Labels' }).fill('tier=frontend');
    await dialog.getByRole('textbox', { name: 'Labels' }).press('Enter');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText(`Labels of ${DEPLOYMENT} updated on ${DISPLAY_NAME}`)).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('tier=frontend')).toBeVisible();
    expect(mutations()).toHaveLength(1);
    const [patch] = mutations();
    expect(patch?.method).toBe('PATCH');
    expect(patch?.path).toBe(`/apis/apps/v1/namespaces/${WORK_NAMESPACE}/deployments/${DEPLOYMENT}`);
    expect(patch?.contentType).toContain('application/json-patch+json');
    expect(patch?.token).toBe(EDITOR_TOKEN);
    expect(fake.deployment().metadata.labels).toEqual({ app: DEPLOYMENT, tier: 'frontend' });
  });

  test('DEP-4: Edit Pod count scales through the scale subresource', async ({ page }) => {
    await openAs(page, RW_USER, deploymentPath());
    await (await enabledAction(page, 'Edit Pod count')).click();
    await expectProductionContext(page, 'Edit Pod count');
    const dialog = page.getByRole('dialog', { name: 'Edit Pod count' });
    await expect(dialog.getByRole('spinbutton', { name: 'Pod count' })).toHaveValue('1');
    await dialog.getByRole('button', { name: 'Increment' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText(`${DEPLOYMENT} scaled to 2 on ${DISPLAY_NAME}`)).toBeVisible();
    expect(mutations().map((r) => [r.method, r.path, r.body, r.token])).toEqual([
      [
        'PATCH',
        `/apis/apps/v1/namespaces/${WORK_NAMESPACE}/deployments/${DEPLOYMENT}/scale`,
        [{ op: 'replace', path: '/spec/replicas', value: 2 }],
        EDITOR_TOKEN,
      ],
    ]);
  });

  test('DEP-5: ring arrows debounce clicks into one scale request', async ({ page }) => {
    await openAs(page, RW_USER, deploymentPath());
    const increase = page.getByRole('button', { name: 'Increase the Pod count' });
    await expect(increase).toBeEnabled();
    await increase.click();
    await increase.click();
    await expect(page.getByRole('img', { name: /Scaling to 3/ })).toBeVisible();
    await expect.poll(() => fake.deployment().spec?.replicas, { timeout: 5_000 }).toBe(3);
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0]?.path).toMatch(/\/deployments\/web\/scale$/);

    await page.getByRole('button', { name: 'Decrease the Pod count' }).click();
    await expect.poll(() => fake.deployment().spec?.replicas, { timeout: 5_000 }).toBe(2);
    expect(mutations()).toHaveLength(2);
  });

  test('DEP-6/7: pause shows the alert and blocks restart; resume and restart patch the Deployment', async ({
    page,
  }) => {
    await openAs(page, RW_USER, deploymentPath());
    await (await enabledAction(page, 'Pause rollouts')).click();
    await expect(page.getByText(`Rollouts paused for ${DEPLOYMENT} on ${DISPLAY_NAME}`)).toBeVisible();
    await expect(page.getByText(`${DEPLOYMENT} is paused`)).toBeVisible();
    expect(fake.deployment().spec?.paused).toBe(true);

    await page.getByRole('button', { name: 'Actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Restart rollout' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Resume rollouts' }).click();
    await expect(page.getByText(`${DEPLOYMENT} is paused`)).toBeHidden();
    expect(fake.deployment().spec?.paused).toBe(false);

    await (await enabledAction(page, 'Restart rollout')).click();
    await expect(page.getByText(`Rollout restarted for ${DEPLOYMENT} on ${DISPLAY_NAME}`)).toBeVisible();
    const template = fake.deployment().spec?.template as { metadata?: { annotations?: Record<string, string> } };
    const restartedAt = template.metadata?.annotations?.['kubectl.kubernetes.io/restartedAt'] ?? '';
    expect(Number.isNaN(Date.parse(restartedAt))).toBe(false);
    expect(mutations().every((r) => r.method === 'PATCH' && r.token === EDITOR_TOKEN)).toBe(true);
    expect(mutations()).toHaveLength(3);
  });

  test('DEP-10: Rollback from the ReplicaSets tab restores the old template', async ({ page }) => {
    await openAs(page, RW_USER, `${deploymentPath()}/replicasets`);
    const row = page.getByRole('row', { name: new RegExp(OLD_REPLICASET) });
    await row.getByRole('button', { name: 'Kebab toggle' }).click();
    const item = page.getByRole('menuitem', { name: 'Rollback' });
    await expect(item).not.toHaveAttribute('aria-disabled', 'true');
    await item.click();
    const dialog = page.getByRole('dialog', { name: 'Rollback' });
    await expect(dialog.getByText(/Are you sure you want to rollback to/)).toBeVisible();
    await expect(dialog).toContainText(DISPLAY_NAME);
    await expect(dialog.getByText('prod', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Rollback' }).click();

    await expect(page.getByText(`Rolled back ${DEPLOYMENT} to revision 1 on ${DISPLAY_NAME}`)).toBeVisible();
    const template = fake.deployment().spec?.template as { spec: { containers: { image: string }[] } };
    expect(template.spec.containers[0]?.image).toBe(OLD_IMAGE);
    expect(mutations()).toHaveLength(1);
  });

  test('LOG-3/5: Logs follow new lines, pause and resume, then show the previous log', async ({ page }) => {
    await openAs(page, RW_USER, `${podPath()}/logs`);
    const panel = page.getByRole('tabpanel', { name: 'Logs' });
    await expect(panel.getByText('listening on :8080')).toBeVisible();
    // OCP `TogglePlay`: the stream state is the play/pause button's tooltip.
    const pause = panel.getByRole('button', { name: 'Pause event streaming' });
    await pause.hover();
    await expect(page.getByRole('tooltip', { name: 'Log streaming...' })).toBeVisible();
    const logRequest = fake.requests.find((r) => r.path.endsWith(`/pods/${POD}/log`));
    expect(logRequest?.query.get('follow')).toBe('true');
    expect(logRequest?.query.get('container')).toBe(CONTAINER);

    fake.appendLog('hello from e2e');
    await expect(panel.getByText('hello from e2e')).toBeVisible({ timeout: 2_000 });

    await pause.click();
    await expect(panel.getByRole('button', { name: 'Start streaming events' })).toBeVisible();
    fake.appendLog('written while paused');
    const resume = panel.getByRole('button', { name: /^Resume stream/ });
    await expect(resume).toBeVisible();
    await expect(panel.getByText('written while paused')).toBeHidden();
    await resume.click();
    await expect(panel.getByText('written while paused')).toBeVisible();
    await expect(pause).toBeVisible();

    await panel.getByRole('button', { name: 'Log type' }).click();
    await page.getByRole('option', { name: 'Previous log' }).click();
    await expect(panel.getByText('panic: config reload failed')).toBeVisible();
    await expect(panel.getByText('Log stream ended.', { exact: true })).toBeVisible();
    expect(fake.requests.some((r) => r.path.endsWith('/log') && r.query.get('previous') === 'true')).toBe(true);
  });

  test('TERM-1/2: the Terminal tab opens a shell that echoes', async ({ page }) => {
    await openAs(page, RW_USER, `${podPath()}/terminal`);
    const terminal = page.getByRole('group', { name: `Terminal of container ${CONTAINER}` });
    await expect(terminal).toContainText('$', { timeout: 15_000 });
    await terminal.click();
    await page.keyboard.type('echo hi');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText(/echo hi\s*hi\s*\$/);

    const [upgrade] = fake.requests.filter((r) => r.method === 'UPGRADE');
    expect(upgrade?.path).toBe(`/api/v1/namespaces/${WORK_NAMESPACE}/pods/${POD}/exec`);
    expect(upgrade?.query.get('container')).toBe(CONTAINER);
    expect(upgrade?.token).toBe(EDITOR_TOKEN);
  });
});

test.describe('read-only user on a production cluster', () => {
  test('ACT-4: every mutating action is aria-disabled with the reason and sends nothing', async ({
    page,
  }) => {
    await openAs(page, RO_USER, deploymentPath());
    await page.getByRole('button', { name: 'Actions' }).click();
    for (const name of [
      'Edit Pod count',
      'Pause rollouts',
      'Restart rollout',
      'Edit update strategy',
      'Edit labels',
      'Edit annotations',
      'Edit Deployment',
      'Delete Deployment',
    ]) {
      await expect(page.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    await page.getByRole('menuitem', { name: 'Edit labels' }).hover();
    await expect(page.getByText(`Your access to ${cluster} is read-only.`)).toBeVisible();
    await page.getByRole('menuitem', { name: 'Delete Deployment' }).click({ force: true });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(mutations()).toEqual([]);
  });

  test('DEP-5: the ring has no scale arrows for a read-only user', async ({ page }) => {
    await openAs(page, RO_USER, deploymentPath());
    await expect(page.getByRole('img', { name: /1/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Increase the Pod count' })).toHaveCount(0);
  });

  test('ACT-4: Edit Deployment is aria-disabled for a read-only user', async ({ page }) => {
    await openAs(page, RO_USER, deploymentPath());
    await page.getByRole('button', { name: 'Actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit Deployment' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('TERM-4: the Terminal tab explains read-only access and opens no socket', async ({ page }) => {
    await openAs(page, RO_USER, `${podPath()}/terminal`);
    await expect(page.getByText('Terminal not available')).toBeVisible();
    await expect(
      page.getByText(`You have read-only access to ${cluster}. The terminal is not available.`),
    ).toBeVisible();
    expect(fake.requests.filter((r) => r.method === 'UPGRADE')).toEqual([]);
    // Every request alice's session made carried the viewer token, never the editor's.
    expect(fake.requests.every((r) => r.token === VIEWER_TOKEN)).toBe(true);
  });
});

async function addCredential(api: APIRequestContext, name: string, token: string): Promise<string> {
  const response = await ok(
    await api.post(`/api/admin/clusters/${cluster}/credentials`, {
      headers: CSRF,
      data: { name, description: null, token },
    }),
    `add credential ${name}`,
  );
  return ((await response.json()) as { id: string }).id;
}

/**
 * Grants `username` access to the spec's cluster, creating the user on a fresh database. A user flagged read-only on
 * the shared dev database would make the read-write half meaningless, so that fails loudly instead.
 */
async function grant(
  api: APIRequestContext,
  username: DevUser,
  credentialId: string,
  accessMode: 'readOnly' | 'readWrite',
): Promise<void> {
  const existing = await api.get(`/api/admin/users/${username}`);
  if (existing.status() === 404) {
    await ok(await api.post('/api/admin/users', { headers: CSRF, data: { username } }), `create ${username}`);
  } else if (accessMode === 'readWrite' && ((await existing.json()) as { isReadOnly: boolean }).isReadOnly) {
    throw new Error(`${username} is flagged read-only on this database; clear the flag to run the CP4a e2e.`);
  }
  await ok(
    await api.post('/api/admin/grants', {
      headers: CSRF,
      data: { username, clusterName: cluster, credentialId, accessMode },
    }),
    `grant ${username}`,
  );
}
