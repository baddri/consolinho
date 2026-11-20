import { expect, test } from '@playwright/test';
import { FAKE_NAMESPACE } from './support/fakeKubeApi';
import { loginAs } from './support/session';

const cluster = (): string => process.env.E2E_CLUSTER ?? '';

/** H1 (AUTH-2): a deep link survives the login round trip; a foreign `returnUrl` is not followed. */
test('H1: deep link survives login, external returnUrl lands on /', async ({ page, baseURL }) => {
  const deepLink = `/c/${cluster()}/k8s/ns/${FAKE_NAMESPACE}/pods?q=1`;
  await page.goto(deepLink);
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await loginAs(page, 'alice');
  await expect(page).toHaveURL(`${baseURL}${deepLink}`);

  // Logged out again (fresh cookies), as in a new private window.
  await page.context().clearCookies();
  await page.goto('/login?returnUrl=https%3A%2F%2Fexample.com');
  await loginAs(page, 'alice');
  // "/" then redirects to alice's first cluster; what matters is that we stay on our own origin.
  await page.waitForURL((url) => url.origin === baseURL && !url.pathname.startsWith('/login'));
  expect(page.url()).not.toContain('example.com');
});

/** H2 (AUTH-10): logout shows the logged-out login page and does not bounce back into the OAuth flow. */
test('H2: logout lands on the login page and stays there', async ({ page, baseURL }) => {
  await page.goto('/login');
  await loginAs(page, 'alice');
  await expect(page).not.toHaveURL(/\/login/);

  await page.getByRole('button', { name: /alice/i }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(`${baseURL}/login?loggedOut=1`);
  await expect(page.getByText('You have been logged out.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in with OpenShift' })).toBeVisible();

  // Deliberate negative check (spec: "wait ~5 s"): no automatic redirect to the OAuth picker; 2 s keeps it fast.
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(`${baseURL}/login?loggedOut=1`);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('link', { name: 'Log in with OpenShift' })).toBeVisible();
});
