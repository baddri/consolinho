import { screen, waitFor, within } from '@testing-library/react';
import type { Pod } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { podsMountingClaim, pvcPhase } from './persistentVolumeClaim';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** A pod named `name` mounting the given claims. */
function pod(name: string, claims: string[]): Pod {
  return {
    metadata: { name },
    spec: {
      containers: [],
      volumes: [
        { name: 'config', configMap: { name: 'cfg' } },
        ...claims.map((claimName) => ({ name: claimName, persistentVolumeClaim: { claimName } })),
      ],
    },
  };
}

/** The details row (`DescriptionListGroup`) labelled `label`. */
function detailsRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

/** Row cells of the PVC table by claim name (the first link of each row). */
function rowsByName(table: HTMLElement): Map<string, HTMLElement[]> {
  return new Map(
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row): [string, HTMLElement[]] => [
        within(row).getAllByRole('link')[0]?.textContent ?? '',
        within(row).getAllByRole('cell'),
      ]),
  );
}

describe('persistentVolumeClaim helpers', () => {
  it('podsMountingClaim keeps only pods with a volume for the claim', () => {
    const pods = [pod('db-0', ['db-data']), pod('web', []), pod('both', ['uploads', 'db-data']), pod('up', ['uploads'])];
    expect(podsMountingClaim(pods, 'db-data').map((p) => p.metadata?.name)).toEqual(['db-0', 'both']);
    expect(podsMountingClaim(pods, 'missing')).toEqual([]);
    expect(podsMountingClaim([{ metadata: { name: 'bare' } }], 'db-data')).toEqual([]);
  });

  it('pvcPhase is Terminating while deleted, else the phase', () => {
    expect(pvcPhase({ metadata: { deletionTimestamp: '2026-01-01T00:00:00Z' }, status: { phase: 'Bound' } })).toBe(
      'Terminating',
    );
    expect(pvcPhase({ status: { phase: 'Pending' } })).toBe('Pending');
    expect(pvcPhase({})).toBe('Unknown');
  });
});

describe('PersistentVolumeClaims (T-0307)', () => {
  it(
    'PVC-1: the list shows OCP columns, volume links and capacities',
    async () => {
      // Namespace-scoped, so no Namespace column (as OCP).
      renderApp('/c/dev-1/k8s/ns/shop/persistentvolumeclaims');

      const table = await screen.findByRole(
        'grid',
        { name: 'PersistentVolumeClaims' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      await within(table).findByRole('link', { name: 'db-data' });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual([
        'Name',
        'Status',
        'PersistentVolume',
        'Capacity',
        'StorageClass',
        'Created',
        'Actions',
      ]);
      const rows = rowsByName(table);
      expect([...rows.keys()].sort()).toEqual(['db-data', 'resizing', 'scratch', 'uploads']);
      const cell = (name: string, index: number): HTMLElement => {
        const found = rows.get(name)?.[index];
        if (!found) throw new Error(`no cell ${String(index)} of ${name}`);
        return found;
      };
      expect(cell('db-data', 1)).toHaveTextContent('Bound');
      expect(within(cell('db-data', 2)).getByRole('link', { name: 'pv-db-data' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/cluster/persistentvolumes/pv-db-data',
      );
      expect(cell('db-data', 3)).toHaveTextContent('10 GiB');
      expect(within(cell('db-data', 4)).getByRole('link', { name: 'standard-csi' })).toBeInTheDocument();
      expect(cell('scratch', 1)).toHaveTextContent('Pending');
      expect(cell('scratch', 2)).toHaveTextContent('No PersistentVolume');
      expect(cell('scratch', 3)).toHaveTextContent('1 GiB');
      // Capacity is what was provisioned, not the raised request.
      expect(cell('resizing', 3)).toHaveTextContent('4 GiB');
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'PVC-1: the Status filter restores from ?status=',
    async () => {
      renderApp('/c/dev-1/k8s/ns/shop/persistentvolumeclaims?status=Pending');

      const table = await screen.findByRole(
        'grid',
        { name: 'PersistentVolumeClaims' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      await within(table).findByRole('link', { name: 'scratch' });
      await waitFor(() => expect([...rowsByName(table).keys()]).toEqual(['scratch']));
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'PVC-2: bound claim details show OCP rows and the pods mounting it',
    async () => {
      renderApp('/c/dev-1/k8s/ns/shop/persistentvolumeclaims/db-data');

      await screen.findByRole(
        'heading',
        { name: 'PersistentVolumeClaim details' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(detailsRow('Label selector')).toHaveTextContent('No selector');
      expect(detailsRow('Status')).toHaveTextContent('Bound');
      expect(detailsRow('Requested capacity')).toHaveTextContent('10 GiB');
      expect(detailsRow('Capacity')).toHaveTextContent('10 GiB');
      expect(detailsRow('Access modes')).toHaveTextContent('ReadWriteOnce');
      expect(detailsRow('Volume mode')).toHaveTextContent('Filesystem');
      expect(within(detailsRow('StorageClasses')).getByRole('link', { name: 'standard-csi' })).toBeInTheDocument();
      expect(within(detailsRow('PersistentVolumes')).getByRole('link', { name: 'pv-db-data' })).toBeInTheDocument();
      await within(detailsRow('Pods')).findByRole('link', { name: 'db-0' });
      const pods = within(detailsRow('Pods'))
        .getAllByRole('link')
        .map((link) => link.textContent);
      expect(pods).toEqual(['db-0', 'db-1', 'db-2']);
      expect(screen.getByText('No conditions found')).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'PVC-2: a pending claim has no volume, capacity or pods; a resizing claim shows its condition',
    async () => {
      const { unmount } = renderApp('/c/dev-1/k8s/ns/shop/persistentvolumeclaims/scratch');
      await screen.findByRole(
        'heading',
        { name: 'PersistentVolumeClaim details' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(detailsRow('Requested capacity')).toHaveTextContent('1 GiB');
      expect(screen.queryByText('Capacity', { selector: 'dt *, dt' })).not.toBeInTheDocument();
      expect(screen.queryByText('PersistentVolumes', { selector: 'dt *, dt' })).not.toBeInTheDocument();
      expect(detailsRow('Pods')).toHaveTextContent('-');
      unmount();

      renderApp('/c/dev-1/k8s/ns/shop/persistentvolumeclaims/resizing');
      await screen.findByRole('heading', { name: 'PersistentVolumeClaim details' });
      expect(detailsRow('Requested capacity')).toHaveTextContent('8 GiB');
      expect(detailsRow('Capacity')).toHaveTextContent('4 GiB');
      expect(screen.getByRole('heading', { name: 'Conditions' })).toBeInTheDocument();
      expect(screen.getByText('FileSystemResizePending')).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
