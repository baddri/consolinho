import { screen, waitFor, within } from '@testing-library/react';
import { setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../routes';

const DEPLOYMENTS = '/c/dev-1/k8s/ns/shop/deployments';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

describe('useResourceActions edit target (FORM-1, FORM-4)', () => {
  it('Edit Deployment in the row kebab opens the edit form', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const { user, router } = renderApp(DEPLOYMENTS);
    const link = await screen.findByRole('link', { name: 'web' }, { timeout: COLD_START_TIMEOUT_MS });
    const row = link.closest('tr');
    if (!row) throw new Error('no row for web');

    await user.click(within(row).getByRole('button', { name: 'Kebab toggle' }));
    const edit = await screen.findByRole('menuitem', { name: 'Edit Deployment' });
    await waitFor(() => expect(edit).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(edit);

    await waitFor(() => expect(router.state.location.pathname).toBe(`${DEPLOYMENTS}/web/form`));
  });

  it('Edit Deployment in the details Actions menu opens the edit form', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const { user, router } = renderApp(`${DEPLOYMENTS}/web`);
    await user.click(await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }));
    const edit = screen.getByRole('menuitem', { name: 'Edit Deployment' });
    await waitFor(() => expect(edit).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(edit);

    await waitFor(() => expect(router.state.location.pathname).toBe(`${DEPLOYMENTS}/web/form`));
  });

  it('Edit on a kind without a form (ConfigMap) still opens its YAML tab', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const { user, router } = renderApp('/c/dev-1/k8s/ns/shop/configmaps/web-config');
    await user.click(await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS }));
    const edit = screen.getByRole('menuitem', { name: 'Edit ConfigMap' });
    await waitFor(() => expect(edit).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(edit);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/c/dev-1/k8s/ns/shop/configmaps/web-config/yaml'),
    );
  });
});
