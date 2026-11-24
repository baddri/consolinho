import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import {
  CONTAINER,
  CRASHING_POD,
  CRONJOB,
  DEPLOYMENT,
  DEPLOYMENT_CONFIG,
  EDITOR_SA,
  fakeServiceAccountToken,
  OLD_CONTROLLER,
  OLD_IMAGE,
  OLD_REPLICASET,
  POD,
  REPLICAS_DESCRIPTION,
  RUNNING_CONTROLLER,
  SECRET,
  SECRET_VALUES,
  SERVICE,
  startFakeWorkloadsApi,
  STATEFUL_SET,
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
 * CP4b (T-0200) adds QGB-1 (Start Job, Search by label, masked Secret) and the e2e carried from CP4a §4a.9 (Edit
 * update strategy, pod status popover, LOG-6 auto-reconnect) on the same cluster. CP4c (T-0223) adds QGC-1 (Edit
 * Deployment form ↔ YAML ↔ Save, YAML schema hover/completion), the POL-2 YAML tab guard and the e2e carried from
 * §4b.8 (DC Start rollout, RC Rollback and Cancel rollout, StatefulSet ring scale).
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
const cronJobPath = () => `/c/${cluster}/k8s/ns/${WORK_NAMESPACE}/cronjobs/${CRONJOB}`;
const secretPath = () => `/c/${cluster}/k8s/ns/${WORK_NAMESPACE}/secrets/${SECRET}`;
const nsPath = () => `/c/${cluster}/k8s/ns/${WORK_NAMESPACE}`;
const NEW_IMAGE = 'registry.example.com/web:3';

/**
 * Searches the Monaco editor from the top with its Find widget (Monaco renders only visible lines, so the DOM can't be
 * read for off-screen text) and returns the match count text ("1 of 2", "No results") and the first match's box.
 * The widget stays open; Escape closes it and leaves the match selected.
 */
async function findInEditor(page: Page, text: string) {
  // Focus, not click: a click on the (scrolled) lines can land under the code editor's sticky header controls.
  await page.getByRole('textbox', { name: 'YAML editor' }).focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+f');
  const widget = page.locator('.find-widget');
  await widget.getByRole('textbox', { name: 'Find' }).fill(text);
  const count = widget.locator('.matchesCount');
  await expect(count).not.toHaveText('');
  const match = page.locator('.monaco-editor .currentFindMatch').first();
  return {
    count: (await count.textContent()) ?? '',
    box: (await match.count()) ? await match.boundingBox() : null,
  };
}

/** Puts the caret after the first `text` (from the top) and opens a new line below it (Monaco keeps the indentation). */
async function newLineAfter(page: Page, text: string): Promise<void> {
  await findInEditor(page, text);
  await page.keyboard.press('Escape');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
}

/** Waits until the editor shows the object (its first line is rendered). */
async function editorReady(page: Page): Promise<void> {
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('apiVersion: apps/v1');
}

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
    void testInfo.attach('fake-api-unknown-requests', {
      body: fake.unknown.join('\n'),
      contentType: 'text/plain',
    });
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
    await expect(page.getByRole('menuitem', { name: 'Restart rollout' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Resume rollouts' }).click();
    await expect(page.getByText(`${DEPLOYMENT} is paused`)).toBeHidden();
    expect(fake.deployment().spec?.paused).toBe(false);

    await (await enabledAction(page, 'Restart rollout')).click();
    await expect(page.getByText(`Rollout restarted for ${DEPLOYMENT} on ${DISPLAY_NAME}`)).toBeVisible();
    const template = fake.deployment().spec?.template as {
      metadata?: { annotations?: Record<string, string> };
    };
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
    expect(fake.requests.some((r) => r.path.endsWith('/log') && r.query.get('previous') === 'true')).toBe(
      true,
    );
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

test.describe('read-write user: CP4b workloads and carried CP4a flows', () => {
  test('CJ-2: Start Job creates a manual Job from the CronJob and lands on its details', async ({ page }) => {
    await openAs(page, RW_USER, cronJobPath());
    await (await enabledAction(page, 'Start Job')).click();

    await expect(page).toHaveURL(new RegExp(`/k8s/ns/${WORK_NAMESPACE}/jobs/${CRONJOB}-\\d+$`));
    const [create] = mutations();
    expect(mutations()).toHaveLength(1);
    expect(create?.method).toBe('POST');
    expect(create?.path).toBe(`/apis/batch/v1/namespaces/${WORK_NAMESPACE}/jobs`);
    expect(create?.token).toBe(EDITOR_TOKEN);
    const job = create?.body as {
      metadata: {
        name: string;
        annotations: Record<string, string>;
        ownerReferences: { kind: string; name: string }[];
      };
      spec: { template: { spec: { containers: { image: string }[] } } };
    };
    expect(job.metadata.annotations).toEqual({
      'example.com/team': 'reports',
      'cronjob.kubernetes.io/instantiate': 'manual',
    });
    expect(job.metadata.ownerReferences).toMatchObject([
      { kind: 'CronJob', name: CRONJOB, controller: true },
    ]);
    expect(job.spec.template.spec.containers[0]?.image).toBe('registry.example.com/batch:1');
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(job.metadata.name) })).toBeVisible();
    expect(fake.objects('jobs').map((j) => j.metadata.name)).toEqual([job.metadata.name]);
  });

  test('SRCH-1/2: Search by label shows Deployment, Pod and Service sections with one labelled list each', async ({
    page,
  }) => {
    const searchPath = `/c/${cluster}/search/ns/${WORK_NAMESPACE}`;
    await openAs(page, RW_USER, searchPath);
    await expect(page.getByRole('heading', { name: 'No resources selected' })).toBeVisible();

    const kinds = page.getByRole('combobox', { name: 'Resources' });
    for (const [typed, option] of [
      ['deploy', /Deployment$/],
      // T-0237: the KindBadge's screen-reader kind precedes the label, so an option reads "Pod Pod" (as in OCP).
      ['pod', /^(Pod )?Pod$/],
      ['service', /^(Service )?Service$/],
    ] as const) {
      await kinds.click();
      await kinds.fill(typed);
      await page.getByRole('checkbox', { name: option }).click();
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Name', exact: true, expanded: false }).click();
    await page.getByRole('option', { name: 'Label' }).click();
    await page.getByPlaceholder('app=frontend').fill('app=web');
    await page.getByPlaceholder('app=frontend').press('Enter');
    await expect(page).toHaveURL(/[?&]q=app%3Dweb/);

    const rows = (grid: string) => page.getByRole('grid', { name: grid }).getByRole('row');
    await expect(rows('Deployments').filter({ hasText: DEPLOYMENT })).toHaveCount(1);
    await expect(rows('Pods').filter({ hasText: POD })).toHaveCount(1);
    await expect(rows('Pods').filter({ hasText: CRASHING_POD })).toHaveCount(0);
    await expect(rows('Services').filter({ hasText: SERVICE })).toHaveCount(1);
    for (const plural of ['deployments', 'pods', 'services']) {
      const lists = fake.requests.filter(
        (r) =>
          r.path ===
            `${plural === 'deployments' ? '/apis/apps/v1' : '/api/v1'}/namespaces/${WORK_NAMESPACE}/${plural}` &&
          r.query.get('labelSelector') === 'app=web',
      );
      expect(lists.length, `${plural} list with labelSelector`).toBeGreaterThan(0);
    }
  });

  test('CFG-2/3: Secret values are masked by default and Reveal/Hide toggles them', async ({ page }) => {
    await openAs(page, RW_USER, secretPath());
    const data = page.getByRole('list', { name: 'Data' }).or(page.getByLabel('Data', { exact: true }));
    await expect(data.getByText('Value hidden')).toHaveCount(2);
    await expect(page.getByText(SECRET_VALUES.password)).toHaveCount(0);

    await page.getByRole('button', { name: 'Reveal values' }).click();
    await expect(page.getByText(SECRET_VALUES.password)).toBeVisible();
    await expect(page.getByText(SECRET_VALUES.username, { exact: true })).toBeVisible();
    await expect(data.getByText('Value hidden')).toHaveCount(0);

    await page.getByRole('button', { name: 'Hide values' }).click();
    await expect(page.getByText(SECRET_VALUES.password)).toHaveCount(0);
    await expect(data.getByText('Value hidden')).toHaveCount(2);

    // Not persisted: a reload masks again.
    await page.getByRole('button', { name: 'Reveal values' }).click();
    await page.reload();
    await expect(data.getByText('Value hidden')).toHaveCount(2);
    expect(mutations()).toEqual([]);
  });

  test('DEP-8: Edit update strategy switches to Recreate with one JSON Patch', async ({ page }) => {
    await openAs(page, RW_USER, deploymentPath());
    await (await enabledAction(page, 'Edit update strategy')).click();
    await expectProductionContext(page, 'Edit update strategy');
    const dialog = page.getByRole('dialog', { name: 'Edit update strategy' });
    await expect(dialog.getByRole('radio', { name: 'RollingUpdate (default)' })).toBeChecked();
    await expect(dialog.getByRole('textbox', { name: 'Max unavailable' })).toHaveValue('25%');
    await dialog.getByRole('radio', { name: 'Recreate' }).check();
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText(`Update strategy saved for ${DEPLOYMENT}`)).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(mutations().map((r) => [r.method, r.body, r.token])).toEqual([
      ['PATCH', [{ op: 'replace', path: '/spec/strategy', value: { type: 'Recreate' } }], EDITOR_TOKEN],
    ]);
    expect(fake.deployment().spec?.strategy).toEqual({ type: 'Recreate' });
  });

  test('DEP-2/Q6: a CrashLoopBackOff status opens the OCP popover whose View logs opens the container log', async ({
    page,
  }) => {
    await openAs(page, RW_USER, `/c/${cluster}/k8s/ns/${WORK_NAMESPACE}/pods`);
    const row = page.getByRole('row', { name: new RegExp(CRASHING_POD) });
    await row.getByRole('button', { name: 'CrashLoopBackOff' }).click();
    const popover = page.getByRole('dialog').filter({ hasText: 'Pod crash loop backoff' });
    await expect(popover).toContainText('back-off 5m0s restarting failed container=app');
    await expect(popover.getByRole('link', { name: 'View events' })).toBeVisible();
    await popover.getByRole('link', { name: 'View logs' }).click();
    await expect(page).toHaveURL(new RegExp(`/pods/${CRASHING_POD}/logs\\?container=${CONTAINER}$`));
    await expect(page.getByRole('tabpanel', { name: 'Logs' })).toBeVisible();
  });

  test("LOG-6: a server-side cut of a running container's log reconnects with sinceTime, no duplicates", async ({
    page,
  }) => {
    await openAs(page, RW_USER, `${podPath()}/logs`);
    const panel = page.getByRole('tabpanel', { name: 'Logs' });
    await expect(panel.getByText('listening on :8080')).toBeVisible();
    const logRequests = () => fake.requests.filter((r) => r.path.endsWith(`/pods/${POD}/log`));
    // The dev build may open the stream twice (StrictMode remount); only requests after the cut are the reconnect.
    const beforeCut = logRequests().length;

    fake.cutLogStreams();
    fake.appendLog('written after the cut');
    await expect(panel.getByText('written after the cut')).toBeVisible({ timeout: 5_000 });
    expect(logRequests().length).toBeGreaterThan(beforeCut);
    const resumed = logRequests()[beforeCut];
    expect(resumed?.query.get('follow')).toBe('true');
    expect(resumed?.query.get('sinceTime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await expect(panel.getByText('listening on :8080')).toHaveCount(1);
    await expect(panel.getByText('starting web v2')).toHaveCount(1);
    await expect(panel.getByText('Log stream ended.', { exact: true })).toBeHidden();
    // Still following after the reconnect.
    fake.appendLog('and still following');
    await expect(panel.getByText('and still following')).toBeVisible();
  });
});

test.describe('read-write user: CP4c forms, schema and carried CP4b flows', () => {
  test('QGC-1/FORM-1/FORM-3: an image edited in Form view shows in YAML view; Save PUTs it with its resourceVersion', async ({
    page,
  }) => {
    await openAs(page, RW_USER, deploymentPath());
    await (await enabledAction(page, 'Edit Deployment')).click();
    await expect(page).toHaveURL(new RegExp(`${deploymentPath()}/form$`));
    await expect(page.getByRole('radio', { name: 'Form view' })).toBeChecked();
    const imageName = page.getByRole('textbox', { name: 'Image Name' });
    await expect(imageName).toHaveValue('registry.example.com/web:2');
    await imageName.fill(NEW_IMAGE);

    await page.getByRole('radio', { name: 'YAML view' }).click();
    await editorReady(page);
    expect((await findInEditor(page, `image: ${NEW_IMAGE}`)).count).toBe('1 of 1');
    await page.keyboard.press('Escape');
    expect(mutations()).toEqual([]);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(new RegExp(`${deploymentPath()}$`));
    expect(mutations().map((r) => [r.method, r.path, r.token])).toEqual([
      ['PUT', `/apis/apps/v1/namespaces/${WORK_NAMESPACE}/deployments/${DEPLOYMENT}`, EDITOR_TOKEN],
    ]);
    const sent = mutations()[0]?.body as { metadata: { resourceVersion: string } };
    expect(sent.metadata.resourceVersion).toBe('100');
    const template = fake.deployment().spec?.template as { spec: { containers: { image: string }[] } };
    expect(template.spec.containers[0]?.image).toBe(NEW_IMAGE);
  });

  test('QGC-1/OAPI-3: the YAML tab hovers a field description, completes spec children and flags a wrong type', async ({
    page,
  }) => {
    await openAs(page, RW_USER, `${deploymentPath()}/yaml`);
    // The sidebar toggle appears once the cluster's schema for the kind loaded (OAPI-1 through the proxy).
    await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
    await editorReady(page);

    const { box } = await findInEditor(page, 'replicas: 1');
    await page.keyboard.press('Escape');
    expect(box).not.toBeNull();
    const hover = page.locator('.monaco-hover:not(.hidden)');
    await expect(async () => {
      await page.mouse.move(0, 0);
      await page.mouse.move((box?.x ?? 0) + 20, (box?.y ?? 0) + (box?.height ?? 0) / 2);
      await expect(hover).toContainText(REPLICAS_DESCRIPTION, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    // Move off the hover, or it sits over the editor and swallows the next click.
    await page.mouse.move(0, 0);
    await expect(hover).toBeHidden();

    await newLineAfter(page, 'replicas: 1');
    await page.keyboard.press('Control+Space');
    const suggestions = page.locator('.suggest-widget');
    await expect(suggestions).toContainText('minReadySeconds');
    await expect(suggestions).toContainText('progressDeadlineSeconds');
    await page.keyboard.press('Escape');

    // An unknown key: real cluster schemas have no `additionalProperties: false`, so the meaningful check is that
    // the schema validates at all; a wrong type on a known key is flagged.
    await page.keyboard.type('paused: notABoolean');
    await expect(
      page.locator('.monaco-editor .squiggly-error, .monaco-editor .squiggly-warning').first(),
    ).toBeVisible();
    expect(fake.unknown.filter((u) => u.includes('openapi'))).toEqual([]);
  });

  test('POL-2: YAML tab Cancel asks before discarding edits, Reload restores the live object', async ({
    page,
  }) => {
    await openAs(page, RW_USER, `${deploymentPath()}/yaml`);
    await editorReady(page);
    await newLineAfter(page, 'replicas: 1');
    await page.keyboard.type('minReadySeconds: 5');
    expect((await findInEditor(page, 'minReadySeconds: 5')).count).toBe('1 of 1');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Reload' }).click();
    await expect.poll(async () => (await findInEditor(page, 'minReadySeconds')).count).toBe('No results');
    await page.keyboard.press('Escape');

    await newLineAfter(page, 'replicas: 1');
    await page.keyboard.type('minReadySeconds: 5');
    await page.getByRole('button', { name: 'Cancel' }).click();
    const guard = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
    await expect(guard).toBeVisible();
    await guard.getByRole('button', { name: 'Discard' }).click();
    await expect(page).toHaveURL(new RegExp(`${deploymentPath()}$`));
    expect(mutations()).toEqual([]);
  });

  test('§4b.8: DC Start rollout POSTs instantiate and adds the next ReplicationController', async ({
    page,
  }) => {
    await openAs(page, RW_USER, `${nsPath()}/deploymentconfigs/${DEPLOYMENT_CONFIG}`);
    await (await enabledAction(page, 'Start rollout')).click();

    await expect(page.getByText(`Started rollout of ${DEPLOYMENT_CONFIG}`)).toBeVisible();
    expect(mutations().map((r) => [r.method, r.path, r.token])).toEqual([
      [
        'POST',
        `/apis/apps.openshift.io/v1/namespaces/${WORK_NAMESPACE}/deploymentconfigs/${DEPLOYMENT_CONFIG}/instantiate`,
        EDITOR_TOKEN,
      ],
    ]);
    expect((mutations()[0]?.body as { kind: string }).kind).toBe('DeploymentRequest');
    expect(fake.object('deploymentconfigs', DEPLOYMENT_CONFIG).status?.latestVersion).toBe(3);
    expect(fake.objects('replicationcontrollers').map((rc) => rc.metadata.name)).toContain(
      `${DEPLOYMENT_CONFIG}-3`,
    );
  });

  test('§4b.8: RC Rollback restores the old ReplicationController template on the DeploymentConfig', async ({
    page,
  }) => {
    await openAs(page, RW_USER, `${nsPath()}/replicationcontrollers/${OLD_CONTROLLER}`);
    await (await enabledAction(page, 'Rollback')).click();
    const dialog = page.getByRole('dialog', { name: 'Rollback' });
    await expect(dialog).toContainText(DISPLAY_NAME);
    await dialog.getByRole('button', { name: 'Rollback' }).click();

    await expect(page.getByText(`Rolled back ${DEPLOYMENT_CONFIG} to revision 1`)).toBeVisible();
    await expect(dialog).toBeHidden();
    const dcPath = `/apis/apps.openshift.io/v1/namespaces/${WORK_NAMESPACE}/deploymentconfigs/${DEPLOYMENT_CONFIG}`;
    expect(mutations().map((r) => [r.method, r.path, r.token])).toEqual([
      ['POST', `${dcPath}/rollback`, EDITOR_TOKEN],
      ['PUT', dcPath, EDITOR_TOKEN],
    ]);
    const template = fake.object('deploymentconfigs', DEPLOYMENT_CONFIG).spec?.template as {
      spec: { containers: { image: string }[] };
    };
    expect(template.spec.containers[0]?.image).toBe(OLD_IMAGE);
  });

  test('§4b.8: RC Cancel rollout confirms, then annotates the running ReplicationController', async ({
    page,
  }) => {
    await openAs(page, RW_USER, `${nsPath()}/replicationcontrollers/${RUNNING_CONTROLLER}`);
    await (await enabledAction(page, 'Cancel rollout')).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel rollout' });
    await expect(dialog.getByText('Are you sure you want to cancel this rollout?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Yes, cancel' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText(/Rollout of .* cancelled/)).toBeVisible();
    expect(mutations().map((r) => [r.method, r.path, r.token])).toEqual([
      [
        'PATCH',
        `/api/v1/namespaces/${WORK_NAMESPACE}/replicationcontrollers/${RUNNING_CONTROLLER}`,
        EDITOR_TOKEN,
      ],
    ]);
    expect(
      fake.object('replicationcontrollers', RUNNING_CONTROLLER).metadata.annotations?.[
        'openshift.io/deployment.cancelled'
      ],
    ).toBe('true');
  });

  test('§4b.8/W4: StatefulSet ring arrows scale through the scale subresource', async ({ page }) => {
    await openAs(page, RW_USER, `${nsPath()}/statefulsets/${STATEFUL_SET}`);
    const increase = page.getByRole('button', { name: 'Increase the Pod count' });
    await expect(increase).toBeEnabled();
    await increase.click();
    await expect
      .poll(() => fake.object('statefulsets', STATEFUL_SET).spec?.replicas, { timeout: 5_000 })
      .toBe(2);
    expect(mutations().map((r) => [r.method, r.path, r.body, r.token])).toEqual([
      [
        'PATCH',
        `/apis/apps/v1/namespaces/${WORK_NAMESPACE}/statefulsets/${STATEFUL_SET}/scale`,
        [{ op: 'replace', path: '/spec/replicas', value: 2 }],
        EDITOR_TOKEN,
      ],
    ]);
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
    await expect(page.getByRole('menuitem', { name: 'Edit Deployment' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('CJ-2/ACT-4: Start Job and Suspend are aria-disabled for a read-only user', async ({ page }) => {
    await openAs(page, RO_USER, cronJobPath());
    await page.getByRole('button', { name: 'Actions' }).click();
    for (const name of ['Start Job', 'Suspend']) {
      await expect(page.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true');
    }
    await page.getByRole('menuitem', { name: 'Start Job' }).click({ force: true });
    expect(mutations()).toEqual([]);
    await expect(page).toHaveURL(new RegExp(`${cronJobPath()}$`));
  });

  test('FORM-3/ACT-4: the Edit Deployment form is read-only with the reason and has no Save', async ({
    page,
  }) => {
    await openAs(page, RO_USER, `${deploymentPath()}/form`);
    await expect(page.getByText(`Your access to ${cluster} is read-only.`)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Image Name' })).not.toBeEditable();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    expect(mutations()).toEqual([]);
  });

  test('CFG-5: a read-only user can reveal Secret values', async ({ page }) => {
    await openAs(page, RO_USER, secretPath());
    await page.getByRole('button', { name: 'Reveal values' }).click();
    await expect(page.getByText(SECRET_VALUES.password)).toBeVisible();
    await page.getByRole('button', { name: 'Actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit Secret' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
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
