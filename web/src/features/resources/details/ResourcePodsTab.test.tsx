import { screen, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../routes';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** Whether a column titled `title` is listed (header text also carries the resize handle's label). */
const hasColumn = (title: string) =>
  screen
    .getAllByRole('columnheader')
    .some((header) => new RegExp(`^${title}(Column|$)`).test(header.textContent));

/** Opens a workload's Pods tab and waits for the pod row. */
async function openPodsTab(path: string, podName: RegExp) {
  renderApp(`/c/dev-1/k8s/ns/shop/${path}/pods`);
  return screen.findByRole('row', { name: podName }, { timeout: COLD_START_TIMEOUT_MS });
}

describe('workload Pods tab Node column (OCP showNodes)', () => {
  it('shows Node instead of Owner on a DaemonSet', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const row = await openPodsTab('daemonsets/node-agent', /node-agent-h7x2k/);

    expect(hasColumn('Node')).toBe(true);
    expect(hasColumn('Owner')).toBe(false);
    expect(within(row).getByText('worker-1')).toBeInTheDocument();
  });

  it('shows Node instead of Owner on a Job', { timeout: COLD_START_TEST_TIMEOUT_MS }, async () => {
    const row = await openPodsTab('jobs/migrate-db', /migrate-db-/);

    expect(hasColumn('Node')).toBe(true);
    expect(hasColumn('Owner')).toBe(false);
    expect(within(row).getByText('worker-1')).toBeInTheDocument();
  });

  it.each([
    ['deployments/web', /web-7d4b9c8f6d-tq5wn/],
    ['statefulsets/db', /db-0/],
    ['replicasets/legacy-rs', /legacy-rs-5kq8d/],
    ['replicationcontrollers/legacy-rc', /legacy-rc-w2v6n/],
    ['deploymentconfigs/frontend', /frontend-2-7mxkq/],
  ])('keeps Owner on %s', { timeout: COLD_START_TEST_TIMEOUT_MS }, async (path, podName) => {
    await openPodsTab(path, podName);

    expect(hasColumn('Owner')).toBe(true);
    expect(hasColumn('Node')).toBe(false);
  });
});
