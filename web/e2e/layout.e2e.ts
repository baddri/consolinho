import { expect, test, type Locator, type Page } from '@playwright/test';
import { FAKE_NAMESPACE } from './support/fakeKubeApi';
import { loginAs } from './support/session';

const cluster = (): string => process.env.E2E_CLUSTER ?? '';

/** The sidebar, where the cluster switcher lives (UX.md §2). */
const sidebar = (page: Page): Locator => page.getByRole('navigation', { name: 'Global' });

/**
 * CP3.5 / T-0111, CP3.6 / T-0119: the masthead holds only hamburger, logo, help menu and user menu; the cluster
 * switcher sits in the sidebar and is fully keyboard operable (open, search, Enter keeps the path, Escape returns focus to the toggle).
 */
test('L1: sidebar cluster switcher is keyboard operable and the masthead has no switcher', async ({ page }) => {
  const path = `/c/${cluster()}/k8s/ns/${FAKE_NAMESPACE}/pods`;
  await page.goto(path);
  await loginAs(page, 'alice');

  const banner = page.getByRole('banner');
  await expect(banner.getByRole('button', { name: /switch cluster/i })).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Theme' })).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Help menu' })).toBeVisible();

  const toggle = sidebar(page).getByRole('button', { name: /switch cluster/i });
  await toggle.focus();
  await page.keyboard.press('Enter');
  const search = page.getByRole('textbox', { name: 'Search clusters' });
  await expect(search).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(toggle).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await page.keyboard.type(cluster());
  await page.keyboard.press('Enter');
  await expect(search).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
});

/**
 * CP3.6 / T-0119: OCP's theme classes are on `<html>` from the first paint (`public/theme-init.js`) — felt always,
 * glass by default, high contrast under `prefers-contrast: more` — and the stored colour scheme survives a reload.
 * The masthead theme menu is gone; choosing a scheme moves to User preferences (T-0120).
 */
test('L2: theme classes follow the stored scheme and the OS contrast setting', async ({ page }) => {
  await page.goto(`/c/${cluster()}`);
  await loginAs(page, 'alice');
  const html = page.locator('html');
  await expect(html).toHaveClass(/pf-v6-theme-felt/);
  await expect(html).toHaveClass(/pf-v6-theme-glass/);

  await page.evaluate(() => globalThis.localStorage.setItem('fleetconsole.theme', 'dark'));
  await page.reload();
  await expect(html).toHaveClass(/pf-v6-theme-dark/);
  await expect(sidebar(page).getByRole('button', { name: /switch cluster/i })).toBeVisible();

  await page.emulateMedia({ contrast: 'more' });
  await expect(html).toHaveClass(/pf-v6-theme-high-contrast/);
  await expect(html).not.toHaveClass(/pf-v6-theme-glass/);
  await page.emulateMedia({ contrast: 'no-preference' });
  await expect(html).toHaveClass(/pf-v6-theme-glass/);

  // System follows an OS colour-scheme change live, without a reload.
  await page.evaluate(() => globalThis.localStorage.setItem('fleetconsole.theme', 'system'));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(html).not.toHaveClass(/pf-v6-theme-dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveClass(/pf-v6-theme-dark/);
});
