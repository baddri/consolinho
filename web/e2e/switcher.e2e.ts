import { expect, test } from '@playwright/test';
import { loginAs } from './support/session';

const cluster = (): string => process.env.E2E_CLUSTER ?? '';

/** H3 (SW-2): alice's switcher lists the seeded cluster with its environment and "Read only" labels. */
test('H3: switcher shows the cluster with dev and Read only labels', async ({ page }) => {
  await page.goto(`/c/${cluster()}`);
  await loginAs(page, 'alice');

  const toggle = page.getByRole('button', { name: `Cluster ${cluster()} (dev, read only), switch cluster` });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.getByRole('textbox', { name: 'Search clusters' }).fill(cluster());
  // While searching only the "All clusters" list is shown, so the option is unique.
  const item = page.getByRole('listbox', { name: 'All clusters' }).getByRole('option', { name: cluster() });
  await expect(item).toBeVisible();
  await expect(item.getByText('dev', { exact: true })).toBeVisible();
  await expect(item.getByText('Read only', { exact: true })).toBeVisible();
});

/** H4 (SW-4): users without grants land on the "no clusters" page; only admins get the administration way out. */
test('H4: grantless users see the no-clusters landing', async ({ browser }) => {
  const user = await browser.newPage();
  await user.goto('/');
  await loginAs(user, 'e2e-user');
  await expect(user.getByRole('heading', { name: 'No clusters assigned yet' })).toBeVisible();
  await expect(user.getByText(/You are logged in as\s*e2e-user/)).toBeVisible();
  await expect(user.getByRole('button', { name: 'No clusters' })).toBeDisabled();
  await expect(user.getByRole('link', { name: /administration/i })).toHaveCount(0);
  await user.context().close();

  // A separate context = a private window: no session shared with user.
  const admin = await browser.newPage();
  await admin.goto('/');
  await loginAs(admin, 'e2e-admin');
  await expect(admin.getByRole('heading', { name: 'No clusters assigned yet' })).toBeVisible();
  await expect(admin.getByRole('button', { name: 'No clusters' })).toBeDisabled();
  await expect(admin.getByRole('link', { name: 'Go to Fleet administration' })).toBeVisible();
  await expect(admin.getByRole('link', { name: 'grant yourself access from your user page' })).toBeVisible();
  await admin.context().close();
});
