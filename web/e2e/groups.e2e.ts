import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { FAKE_NAMESPACE, FAKE_POD } from './support/fakeKubeApi';
import { CSRF, loginAs, ok, type DevUser } from './support/session';

/**
 * QG-2 (CP4.5a, T-0266): a group grant gives a member access, Effective access explains it, and a direct grant
 * overrides it — browser → Vite → real Api + DevOAuth emulator. `e2e-member` is in the DevOAuth group `e2e-team` and
 * has no direct grant (global setup revokes its direct grants). The admin grants the group through the cluster's
 * Access tab (UIG-1/2/3 live), the member sees the cluster read-only, then the admin reads Effective access before and
 * after adding a direct read-write grant. Every run starts and ends without either grant, so `--repeat-each` works.
 */

const MEMBER: DevUser = 'e2e-member';
const GROUP = 'e2e-team';
const PRIORITY = 100;

const cluster = (): string => process.env.E2E_CLUSTER ?? '';

/** `text` as a literal inside a `RegExp`. */
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let adminContext: BrowserContext;
let admin: Page;

interface GrantRef {
  id: string;
  subjectKind: 'user' | 'group';
  clusterName: string;
}

/** Revokes `e2e-team`'s grant and `e2e-member`'s direct grant on the spec's cluster; a no-op when neither exists. */
async function revokeScenarioGrants(api: APIRequestContext): Promise<void> {
  const group = (await (
    await ok(await api.get(`/api/admin/groups/${GROUP}/grants`), 'list group grants')
  ).json()) as GrantRef[];
  const memberResponse = await api.get(`/api/admin/users/${MEMBER}/grants`);
  const member =
    memberResponse.status() === 404
      ? []
      : ((await (await ok(memberResponse, 'list member grants')).json()) as GrantRef[]).filter(
          (g) => g.subjectKind === 'user',
        );
  for (const grant of [...group, ...member].filter((g) => g.clusterName === cluster())) {
    await ok(await api.delete(`/api/admin/grants/${grant.id}`, { headers: CSRF }), `revoke ${grant.id}`);
  }
}

/** The cluster's row on Effective access (the one holding its expand toggle). */
const effectiveRow = (page: Page) =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: `Details for ${cluster()}` }) });

test.beforeAll(async ({ browser }, testInfo) => {
  adminContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  admin = await adminContext.newPage();
  await admin.goto('/login');
  await loginAs(admin, 'e2e-admin');
  await admin.waitForURL((url) => !url.pathname.startsWith('/login'));
});

test.beforeEach(() => revokeScenarioGrants(adminContext.request));

test.afterAll(async () => {
  try {
    await revokeScenarioGrants(adminContext.request);
  } finally {
    await adminContext.close();
  }
});

test('QG-2: a group grant gives read-only access, Effective access explains it, a direct grant overrides it', async ({
  browser,
}) => {
  test.setTimeout(90_000);

  await test.step('UIG-1/2/3: admin grants group e2e-team read only at priority 100 on the Access tab', async () => {
    await admin.goto(`/fleet/admin/clusters/${cluster()}/access`);
    await admin.getByRole('button', { name: 'Grant access' }).first().click();
    const dialog = admin.getByRole('dialog', { name: new RegExp(`Grant access to ${escapeRegExp(cluster())}`) });
    await expect(dialog.getByRole('radio', { name: 'User' })).toBeChecked();
    await dialog.getByRole('radio', { name: 'Group' }).check();
    await dialog.getByRole('combobox', { name: 'Subject name' }).click();
    await dialog.getByRole('combobox', { name: 'Subject name' }).fill(GROUP);
    // Free text offers `Use "e2e-team"`; if the host lists the group (DevOAuth groups endpoint), its own option.
    await admin
      .getByRole('option', { name: new RegExp(`^(Use ")?${escapeRegExp(GROUP)}`) })
      .first()
      .click();
    await dialog.getByRole('spinbutton', { name: 'Priority' }).fill(String(PRIORITY));
    await expect(
      dialog.getByText(
        'When a user is in several groups with access to this cluster, the highest priority wins. A direct user grant always wins.',
      ),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Credential' })).toHaveText(/e2e-viewer/);
    await expect(dialog.getByRole('radio', { name: /Read only/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'Grant access' }).click();
    await expect(dialog).toBeHidden();
    await expect(admin.getByText(`Granted group ${GROUP} ReadOnly on ${cluster()}`)).toBeVisible();
    const row = admin.getByRole('row').filter({ has: admin.getByRole('link', { name: GROUP, exact: true }) });
    await expect(row).toContainText(String(PRIORITY));
  });

  await test.step('member logs in, sees the cluster read only and cannot delete the pod', async () => {
    const memberContext = await browser.newContext();
    try {
      const member = await memberContext.newPage();
      await member.goto(`/c/${cluster()}/k8s/ns/${FAKE_NAMESPACE}/pods/${FAKE_POD}`);
      await loginAs(member, MEMBER);
      const toggle = member.getByRole('navigation', { name: 'Global' }).getByRole('button', {
        name: new RegExp(
          `^Cluster .+ \\((${escapeRegExp(cluster())}, )?(OCP|K8s), dev, read only\\), switch cluster$`,
        ),
      });
      await expect(toggle).toBeVisible();
      await member.getByRole('button', { name: 'Actions' }).click();
      const remove = member.getByRole('menuitem', { name: 'Delete Pod' });
      await expect(remove).toHaveAttribute('aria-disabled', 'true');
      await remove.hover();
      await expect(member.getByText(`Your access to ${cluster()} is read-only.`)).toBeVisible();
    } finally {
      await memberContext.close();
    }
  });

  await test.step('Effective access: Source is the group with its priority', async () => {
    await admin.goto(`/fleet/admin/users/${MEMBER}/effective-access`);
    const row = effectiveRow(admin);
    await expect(row).toContainText(`Group ${GROUP} (priority ${PRIORITY})`);
    await expect(row).toContainText('Read only');
    await expect(admin.getByRole('list', { name: `Groups of ${MEMBER}` })).toContainText(GROUP);
  });

  await test.step('a direct read-write grant wins; the group candidate is overridden', async () => {
    const credentials = (await (
      await ok(
        await adminContext.request.get(`/api/admin/clusters/${cluster()}/credentials`),
        'list credentials',
      )
    ).json()) as { id: string }[];
    await ok(
      await adminContext.request.post('/api/admin/grants', {
        headers: CSRF,
        data: {
          username: MEMBER,
          clusterName: cluster(),
          credentialId: credentials[0]?.id,
          accessMode: 'readWrite',
        },
      }),
      'direct grant',
    );
    await admin.reload();
    const row = effectiveRow(admin);
    await expect(row).toContainText('Direct grant');
    await expect(row).toContainText('Read write');
    await row.getByRole('button', { name: `Details for ${cluster()}` }).click();
    const candidates = admin.getByRole('grid', { name: `Matching grants on ${cluster()}` });
    const groupCandidate = candidates
      .getByRole('row')
      .filter({ has: admin.getByRole('link', { name: GROUP, exact: true }) });
    await expect(groupCandidate).toContainText('Overridden by direct grant');
  });

  await test.step('cleanup: revoke both grants', async () => {
    await revokeScenarioGrants(adminContext.request);
    await admin.reload();
    await expect(effectiveRow(admin)).toHaveCount(0);
  });
});
