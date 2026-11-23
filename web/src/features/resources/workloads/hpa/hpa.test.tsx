import { screen, within } from '@testing-library/react';
import { setWatchTimingForTests } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';

const LIST = '/c/dev-1/k8s/ns/shop/horizontalpodautoscalers';
const TARGET_HREF = '/c/dev-1/k8s/ns/shop/deployments/worker';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});

describe('HorizontalPodAutoscaler pages (T-0195)', () => {
  it(
    'HPA-1: the list shows Name, Namespace, Labels, Scale target, Min pods, Max pods',
    async () => {
      // All projects: the Namespace column only renders there (OCP).
      renderApp('/c/dev-1/k8s/all-namespaces/horizontalpodautoscalers');

      const table = await screen.findByRole(
        'grid',
        { name: 'HorizontalPodAutoscalers' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const links = await within(table).findAllByRole(
        'link',
        { name: 'worker' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent);
      for (const title of ['Name', 'Namespace', 'Labels', 'Scale target', 'Min pods', 'Max pods']) {
        expect(headers).toContainEqual(expect.stringContaining(title));
      }
      expect(headers.some((header) => header.includes('Created'))).toBe(false);

      expect(links.map((link) => link.getAttribute('href'))).toContain(TARGET_HREF);
      const row = links[0]?.closest('tr');
      if (!row) throw new Error('no worker row');
      const cells = within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
      expect(cells).toContain('2');
      expect(cells).toContain('5');
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'HPA-1: details show the OCP fields, the metrics row and Conditions; tabs Details, YAML, Events',
    async () => {
      renderApp(`${LIST}/worker`);

      expect(
        await screen.findByRole(
          'heading',
          { name: 'HorizontalPodAutoscaler details' },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Details', 'YAML', 'Events']);

      const target = screen.getByText('Scale target').closest('div');
      if (!target) throw new Error('no Scale target row');
      expect(within(target).getByRole('link', { name: 'worker' })).toHaveAttribute('href', TARGET_HREF);
      for (const label of ['Min replicas', 'Max replicas', 'Last scale time', 'Current replicas', 'Desired replicas']) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }

      const metrics = screen.getByRole('grid', { name: 'Metrics' });
      const row = within(metrics).getAllByRole('row')[1];
      if (!row) throw new Error('no metrics row');
      const cells = within(row).getAllByRole('cell');
      expect(cells[0]).toHaveTextContent('Resource cpu');
      expect(cells[0]).toHaveTextContent('(as a percentage of request)');
      expect(cells[1]).toHaveTextContent('35% (35m)');
      expect(cells[2]).toHaveTextContent('80%');

      expect(screen.getByRole('grid', { name: 'Conditions' })).toBeInTheDocument();
      expect(screen.getByText('ValidMetricFound')).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
