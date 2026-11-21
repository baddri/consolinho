import { expect, test, type Locator, type Page } from '@playwright/test';
import { FAKE_NAMESPACE } from './support/fakeKubeApi';
import { loginAs } from './support/session';

const cluster = (): string => process.env.E2E_CLUSTER ?? '';

/** The sidebar, where the cluster switcher lives (UX.md §2). */
const sidebar = (page: Page): Locator => page.getByRole('navigation', { name: 'Global' });

/**
 * CP3.5 / T-0111: the masthead holds only hamburger, logo, theme menu and user menu; the cluster switcher sits in the
 * sidebar and is fully keyboard operable (open, search, Enter keeps the path, Escape returns focus to the toggle).
 */
test('L1: sidebar cluster switcher is keyboard operable and the masthead has no switcher', async ({ page }) => {
  const path = `/c/${cluster()}/k8s/ns/${FAKE_NAMESPACE}/pods`;
  await page.goto(path);
  await loginAs(page, 'alice');

  const banner = page.getByRole('banner');
  await expect(banner.getByRole('button', { name: /switch cluster/i })).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Theme' })).toBeVisible();

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

/** CP3.5 / T-0111: the theme menu is keyboard operable and the choice survives a reload. */
test('L2: theme menu switches to Dark by keyboard and persists across reload', async ({ page }) => {
  await page.goto(`/c/${cluster()}`);
  await loginAs(page, 'alice');
  const html = page.locator('html');

  const theme = page.getByRole('banner').getByRole('button', { name: 'Theme' });
  await theme.focus();
  await page.keyboard.press('Enter');
  const dark = page.getByRole('option', { name: 'Dark' });
  await expect(dark).toBeVisible();
  await dark.focus();
  await page.keyboard.press('Enter');
  await expect(html).toHaveClass(/pf-v6-theme-dark/);

  await page.reload();
  await expect(sidebar(page).getByRole('button', { name: /switch cluster/i })).toBeVisible();
  await expect(html).toHaveClass(/pf-v6-theme-dark/);

  await theme.click();
  await page.getByRole('option', { name: 'Light' }).click();
  await expect(html).not.toHaveClass(/pf-v6-theme-dark/);

  // System follows an OS colour-scheme change live, without a reload.
  await page.emulateMedia({ colorScheme: 'light' });
  await theme.click();
  await page.getByRole('option', { name: 'System' }).click();
  await expect(html).not.toHaveClass(/pf-v6-theme-dark/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveClass(/pf-v6-theme-dark/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(html).not.toHaveClass(/pf-v6-theme-dark/);
});
