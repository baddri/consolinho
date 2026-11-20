import { expect, test } from '@playwright/test';
import { FAKE_NAMESPACE, FAKE_POD } from './support/fakeKubeApi';
import {
  collectCspViolations,
  type CspViolation,
  fetchApiCsp,
  reloadFromBuild,
  serveProductionBuild,
} from './support/productionBuild';
import { loginAs } from './support/session';

const cluster = (): string => process.env.E2E_CLUSTER ?? '';

/**
 * HOST-3 / SMK-2 (T-0104): the production build, including the lazily loaded Monaco YAML editor and its worker, runs
 * under the CSP the Api sends (ADR-0029) with zero violations across login, list, details and YAML pages. The SPA is
 * served from `web/dist` with the policy read from a live `/api` response; `/api/**` reaches the real stack.
 */
test.describe('HOST-3: production SPA under the Api CSP', () => {
  let violations: CspViolation[] = [];

  test.beforeEach(async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? '').origin;
    const csp = await fetchApiCsp(page);
    expect(csp).toContain("script-src 'self'");
    await serveProductionBuild(page, origin, csp);
    violations = await collectCspViolations(page, origin);
  });

  test('logs in, lists, opens details and renders the YAML tab without violations', async ({
    page,
  }) => {
    const workerUrls: string[] = [];
    page.on('worker', (worker) => workerUrls.push(worker.url()));

    await page.goto(`/c/${cluster()}`);
    await expect(page).toHaveURL(/\/login/);
    await loginAs(page, 'alice');
    await reloadFromBuild(page, new RegExp(`/c/${cluster()}$`));
    await expect(page).toHaveURL(new RegExp(`/c/${cluster()}/`));

    await page.goto(`/c/${cluster()}/k8s/ns/${FAKE_NAMESPACE}/pods`);
    await page.getByRole('link', { name: FAKE_POD, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/k8s/ns/${FAKE_NAMESPACE}/pods/${FAKE_POD}$`));
    await page.getByRole('tab', { name: 'YAML' }).click();
    await expect(page).toHaveURL(new RegExp(`/pods/${FAKE_POD}/yaml$`), { timeout: 15_000 });

    const yaml = page.getByRole('tabpanel', { name: 'YAML' });
    await expect(yaml.getByRole('textbox', { name: 'YAML editor' })).toBeAttached();
    await expect(yaml).toContainText('kind: Pod');
    await expect(yaml).toContainText(`name: ${FAKE_POD}`);
    // The bundled editor worker (ADR-0024, `worker-src 'self'`) started from the build's own assets.
    await expect.poll(() => workerUrls.some((url) => /\/assets\/editor\.worker-.*\.js$/.test(url))).toBe(true);

    // Violation reports are queued tasks; give late ones (fonts, the worker's own policy) a moment. No `networkidle`:
    // the list keeps a watch open.
    await page.waitForTimeout(1_000);
    expect(violations).toEqual([]);
  });
});
