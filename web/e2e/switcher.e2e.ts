import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginAs } from './support/session';

const cluster = (): string => process.env.E2E_CLUSTER ?? '';

/** `text` as a literal inside a `RegExp`. */
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The sidebar, where the cluster switcher lives (UX.md §2); the e2e viewport is desktop-wide, so it is open. */
const sidebar = (page: Page): Locator => page.getByRole('navigation', { name: 'Global' });

/** H3 (SW-2): alice's sidebar switcher lists the seeded cluster with its environment and "Read only" labels. */
test('H3: switcher shows the cluster with dev and Read only labels', async ({ page }) => {
  await page.goto(`/c/${cluster()}`);
  await loginAs(page, 'alice');

  // The seeded display name is environment-specific: "Cluster <displayName> ([<name>, ]OCP|K8s, dev, read only)" (SW-4).
  const toggle = sidebar(page).getByRole('button', {
    name: new RegExp(
      `^Cluster .+ \\((${escapeRegExp(cluster())}, )?(OCP|K8s), dev, read only\\), switch cluster$`,
    ),
  });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.getByRole('combobox', { name: 'Search clusters' }).fill(cluster());
  // While searching only the "All clusters" list is shown, so the option is unique.
  const item = page.getByRole('listbox', { name: 'All clusters' }).getByRole('option', { name: cluster() });
  await expect(item).toBeVisible();
  // T-0203: an OpenShift cluster is recognised by its icon and has no `OCP` tag (only Kubernetes gets `K8s`).
  await expect(item.getByText('OCP', { exact: true })).toHaveCount(0);
  await expect(item.getByText('dev', { exact: true })).toBeVisible();
  await expect(item.getByText('Read only', { exact: true })).toBeVisible();
});

/**
 * H4 (SW-4, FLT-1): users without grants land on the "no clusters" page. The sidebar switcher (none in the masthead)
 * reads "Select a cluster" and still opens, because its menu holds Fleet management for everyone (CP5c); only admins
 * get the administration way out on the page.
 */
test('H4: grantless users see the no-clusters landing', async ({ browser }) => {
  const user = await browser.newPage();
  await user.goto('/');
  await loginAs(user, 'e2e-user');
  await expect(user.getByRole('heading', { name: 'No clusters assigned yet' })).toBeVisible();
  await expect(user.getByText(/You are logged in as\s*e2e-user/)).toBeVisible();
  await expect(user.getByRole('banner').getByRole('button', { name: /cluster/i })).toHaveCount(0);
  await expect(user.getByRole('link', { name: /administration/i })).toHaveCount(0);
  await sidebar(user).getByRole('button', { name: 'Select a cluster' }).click();
  await expect(user.getByRole('option', { name: 'Fleet management' })).toBeVisible();
  await expect(user.getByText('No clusters', { exact: true })).toBeVisible();
  await user.context().close();

  // A separate context = a private window: no session shared with user.
  const admin = await browser.newPage();
  await admin.goto('/');
  await loginAs(admin, 'e2e-admin');
  await expect(admin.getByRole('heading', { name: 'No clusters assigned yet' })).toBeVisible();
  await expect(sidebar(admin).getByRole('button', { name: 'Select a cluster' })).toBeEnabled();
  await expect(admin.getByRole('link', { name: 'Go to Fleet administration' })).toBeVisible();
  await expect(admin.getByRole('link', { name: 'grant yourself access from your user page' })).toBeVisible();
  await admin.context().close();
});

/**
 * H5 (FLEET-1..3, FLT-1/FLT-2): `/fleet` opens the Fleet overview; there the toggle reads "Fleet management" and the
 * sidebar holds the Fleet section, plus Fleet administration for admins only. alice (no admin) reaches the overview
 * from the switcher's "Fleet management" entry on a cluster page, which also loads the lazy overview chunk (T-0361).
 */
test('H5: users switch to the fleet perspective', async ({ browser }) => {
  const admin = await browser.newPage();
  await admin.goto('/fleet');
  await loginAs(admin, 'e2e-admin');
  await expect(admin).toHaveURL(/\/fleet\/overview$/);
  await expect(admin.getByRole('heading', { level: 1, name: 'Fleet overview' })).toBeVisible();
  const toggle = sidebar(admin).getByRole('button', { name: 'Fleet management, switch cluster' });
  await expect(toggle).toBeVisible();
  await expect(sidebar(admin).getByRole('button', { name: 'Fleet', exact: true })).toBeVisible();
  await expect(sidebar(admin).getByRole('button', { name: 'Fleet administration' })).toBeVisible();
  await expect(sidebar(admin).getByRole('button', { name: 'Home' })).toHaveCount(0);
  await toggle.click();
  await expect(admin.getByRole('option', { name: 'Fleet management' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await admin.context().close();

  const user = await browser.newPage();
  await user.goto(`/c/${cluster()}`);
  await loginAs(user, 'alice');
  await sidebar(user)
    .getByRole('button', { name: /switch cluster$/ })
    .click();
  await expect(user.getByRole('listbox', { name: 'All clusters' })).toBeVisible();
  await user.getByRole('option', { name: 'Fleet management' }).click();
  await expect(user).toHaveURL(/\/fleet\/overview$/);
  await expect(user.getByRole('heading', { level: 1, name: 'Fleet overview' })).toBeVisible();
  // alice's one cluster gets its row from the fleet status stream (the fake's health answers, T-0341).
  await expect(user.getByRole('row').filter({ hasText: cluster() })).toBeVisible();
  await expect(sidebar(user).getByRole('button', { name: 'Fleet', exact: true })).toBeVisible();
  await expect(sidebar(user).getByRole('button', { name: 'Fleet administration' })).toHaveCount(0);
  await user.context().close();
});
