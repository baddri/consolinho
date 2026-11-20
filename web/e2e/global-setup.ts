import { chromium, type APIRequestContext, type FullConfig } from '@playwright/test';
import { startFakeKubeApi } from './support/fakeKubeApi';
import { CSRF, deleteCluster, GRANTLESS_USERS, loginAs, ok } from './support/session';

/** Prefix of every cluster the smoke registers; leftovers from aborted runs are deleted on the next run. */
const CLUSTER_PREFIX = 'e2e-smoke-';

/**
 * Seeds the running stack through the admin API (never by touching the dev DB directly, QA risk R6) so the smoke is
 * re-runnable on a non-empty dev database:
 *
 * 1. starts the fake Kubernetes API (QG-4 browsing target);
 * 2. logs in as `e2e-admin` (admin via its group) and deletes `e2e-smoke-*` clusters left over from aborted runs;
 * 3. revokes grants of the reserved users `e2e-user`/`e2e-admin` only (H4 needs them grantless; other users'
 *    grants are never touched);
 * 4. registers a uniquely named development cluster pointing at the fake API, adds a fake-JWT credential and grants
 *    `alice` read-only access (pre-creating `alice` on a fresh database).
 *
 * The cluster name reaches the workers through `process.env.E2E_CLUSTER` (Playwright passes env set here on to
 * workers). The returned teardown deletes the cluster and stops the fake API.
 */
export default async function globalSetup(config: FullConfig): Promise<() => Promise<void>> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error('No baseURL: set E2E_BASE_URL or start the stack with `aspire start`.');

  const fakeApi = await startFakeKubeApi();
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/login');
  await loginAs(page, 'e2e-admin');
  await page.waitForURL(
    (url) => !url.pathname.startsWith('/login') && url.origin === new URL(baseURL).origin,
  );
  const api = context.request;

  const clusters = (await (await ok(await api.get('/api/admin/clusters'), 'list clusters')).json()) as {
    name: string;
  }[];
  for (const { name } of clusters.filter((c) => c.name.startsWith(CLUSTER_PREFIX))) {
    await deleteCluster(api, name);
  }
  for (const user of GRANTLESS_USERS) await revokeAllGrants(api, user);

  const cluster = `${CLUSTER_PREFIX}${Date.now().toString(36)}`;
  await ok(
    await api.post('/api/admin/clusters', {
      headers: CSRF,
      data: {
        name: cluster,
        displayName: null,
        apiUrl: fakeApi.url,
        environment: 'development',
        webConsoleUrl: null,
        description: 'Playwright smoke (T-0054); deleted after the run.',
        caBundle: null,
        skipTlsVerify: true,
      },
    }),
    'register cluster',
  );
  const credential = (await (
    await ok(
      await api.post(`/api/admin/clusters/${cluster}/credentials`, {
        headers: CSRF,
        data: { name: 'e2e-viewer', description: null, token: fakeJwt() },
      }),
      'add credential',
    )
  ).json()) as { id: string };
  if ((await api.get('/api/admin/users/alice')).status() === 404) {
    await ok(
      await api.post('/api/admin/users', { headers: CSRF, data: { username: 'alice' } }),
      'create alice',
    );
  }
  await ok(
    await api.post('/api/admin/grants', {
      headers: CSRF,
      data: { username: 'alice', clusterName: cluster, credentialId: credential.id, accessMode: 'readOnly' },
    }),
    'grant alice',
  );
  process.env.E2E_CLUSTER = cluster;

  return async () => {
    try {
      await deleteCluster(api, cluster);
    } finally {
      await browser.close();
      await fakeApi.close();
    }
  };
}

async function revokeAllGrants(api: APIRequestContext, username: string): Promise<void> {
  const response = await api.get(`/api/admin/users/${username}/grants`);
  if (response.status() === 404) return; // never logged in on this database: no grants either
  const grants = (await (await ok(response, `list ${username} grants`)).json()) as { id: string }[];
  for (const grant of grants) {
    await ok(
      await api.delete(`/api/admin/grants/${grant.id}`, { headers: CSRF }),
      `revoke grant ${grant.id}`,
    );
  }
}

/**
 * An obviously fake, unsigned ServiceAccount-shaped JWT. Every segment is canonical base64url (T-0043 handover: a
 * non-canonical signature makes the Api classify the token as opaque).
 */
function fakeJwt(): string {
  const segment = (value: object | string) =>
    Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  return [
    segment({ alg: 'RS256', kid: 'fake-e2e' }),
    segment({
      iss: 'kubernetes/serviceaccount',
      sub: 'system:serviceaccount:fleet:e2e-viewer',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    segment('fake-signature-not-a-real-token'),
  ].join('.');
}
