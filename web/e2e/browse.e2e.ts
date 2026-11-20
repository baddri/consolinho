import { expect, test } from '@playwright/test';
import { FAKE_NAMESPACE, FAKE_POD } from './support/fakeKubeApi';
import { loginAs } from './support/session';

const cluster = (): string => process.env.E2E_CLUSTER ?? '';

/**
 * QG-4 (CP2): alice opens Pods on her cluster through the real proxy (fake API server behind it) and sees the pod;
 * then opens it and its read-only YAML tab.
 */
test.describe('QG-4: browsing as alice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/c/${cluster()}`);
    await loginAs(page, 'alice');
    await expect(page).toHaveURL(new RegExp(`/c/${cluster()}/`));
  });

  test('opens Pods from the navigation and lists the pod', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Global' });
    await nav.getByRole('button', { name: 'Workloads' }).click();
    await nav.getByRole('link', { name: 'Pods', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/${cluster()}/k8s/all-namespaces/pods`));
    const row = page.getByRole('row', { name: new RegExp(FAKE_POD) });
    await expect(row).toBeVisible();
    await expect(row.getByRole('link', { name: FAKE_NAMESPACE, exact: true })).toBeVisible();
    await expect(row.getByText('Running')).toBeVisible();
  });

  test('opens the pod and shows its read-only YAML', async ({ page }) => {
    await page.goto(`/c/${cluster()}/k8s/ns/${FAKE_NAMESPACE}/pods`);
    await page.getByRole('link', { name: FAKE_POD, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/k8s/ns/${FAKE_NAMESPACE}/pods/${FAKE_POD}$`));
    await page.getByRole('tab', { name: 'YAML' }).click();
    // Tabs are lazy routes: the URL changes once the chunk loads, which a cold Vite dev server compiles on demand.
    await expect(page).toHaveURL(new RegExp(`/pods/${FAKE_POD}/yaml$`), { timeout: 15_000 });
    // Read-only view (PF CodeBlock until the Monaco editor in T-0077): assert visible YAML text, no edit controls.
    const yaml = page.getByRole('tabpanel', { name: 'YAML' });
    await expect(yaml).toContainText('kind: Pod');
    await expect(yaml).toContainText(`name: ${FAKE_POD}`);
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
  });
});
