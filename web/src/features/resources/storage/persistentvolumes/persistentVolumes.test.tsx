import { screen, within } from '@testing-library/react';
import type { PersistentVolume } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { nodeAffinityLines, pvPhase, pvSource } from './persistentVolume';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** A PV with the given spec. */
function pv(spec: PersistentVolume['spec']): PersistentVolume {
  return { metadata: { name: 'pv' }, spec: { capacity: { storage: '1Gi' }, accessModes: ['ReadWriteOnce'], ...spec } };
}

/** The details row (`DescriptionListGroup`) labelled `label`. */
function detailsRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

describe('persistentVolume helpers', () => {
  it('pvSource summarises csi, nfs, hostPath and local; other sources by key; none without one', () => {
    expect(pvSource(pv({ csi: { driver: 'csi.example.com', volumeHandle: 'h' } }))).toEqual({
      type: 'csi',
      detail: 'csi.example.com',
    });
    expect(pvSource(pv({ nfs: { server: 'nfs.example.com', path: '/exports/a' } }))).toEqual({
      type: 'nfs',
      detail: 'nfs.example.com:/exports/a',
    });
    expect(pvSource(pv({ hostPath: { path: '/mnt/data' } }))).toEqual({ type: 'hostPath', detail: '/mnt/data' });
    expect(pvSource(pv({ local: { path: '/mnt/disks/1' } }))).toEqual({ type: 'local', detail: '/mnt/disks/1' });
    expect(pvSource(pv({ storageClassName: 'x', iscsi: { targetPortal: 't', iqn: 'i', lun: 0 } }))).toEqual({
      type: 'iscsi',
      detail: '',
    });
    expect(pvSource(pv({ storageClassName: 'x' }))).toBeUndefined();
  });

  it('nodeAffinityLines prints one `key op values` line per requirement', () => {
    const affinity = pv({
      nodeAffinity: {
        required: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                { key: 'zone', operator: 'In', values: ['a', 'b'] },
                { key: 'ssd', operator: 'Exists' },
              ],
            },
          ],
        },
      },
    });
    expect(nodeAffinityLines(affinity)).toEqual(['zone In a, b', 'ssd Exists']);
    expect(nodeAffinityLines(pv({}))).toEqual([]);
  });

  it('pvPhase is Terminating while deleted, else the phase', () => {
    expect(pvPhase({ metadata: { deletionTimestamp: '2026-01-01T00:00:00Z' }, status: { phase: 'Bound' } })).toBe(
      'Terminating',
    );
    expect(pvPhase({ status: { phase: 'Released' } })).toBe('Released');
    expect(pvPhase({})).toBe('Unknown');
  });
});

describe('PersistentVolumes (T-0306)', () => {
  it(
    'PV-1: the list shows OCP columns, phases and claim links',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/persistentvolumes');

      const table = await screen.findByRole('grid', { name: 'PersistentVolumes' }, { timeout: COLD_START_TIMEOUT_MS });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Status', 'Claim', 'Capacity', 'Labels', 'Created', 'Actions']);
      await within(table).findByRole('link', { name: 'pv-db-data' });
      const rows = new Map<string, HTMLElement[]>(
        within(table)
          .getAllByRole('row')
          .slice(1)
          .map((row): [string, HTMLElement[]] => [
            within(row).getAllByRole('link')[0]?.textContent ?? '',
            within(row).getAllByRole('cell'),
          ]),
      );
      expect([...rows.keys()].sort()).toEqual(['pv-db-data', 'pv-old', 'pv-spare', 'pv-uploads', 'pvc-resizing-0f9e']);
      const cell = (name: string, index: number): HTMLElement => {
        const found = rows.get(name)?.[index];
        if (!found) throw new Error(`no cell ${String(index)} of ${name}`);
        return found;
      };
      expect(cell('pv-db-data', 1)).toHaveTextContent('Bound');
      expect(within(cell('pv-db-data', 2)).getByRole('link', { name: 'db-data' })).toBeInTheDocument();
      expect(cell('pv-db-data', 3)).toHaveTextContent('10Gi');
      expect(cell('pv-spare', 1)).toHaveTextContent('Available');
      expect(cell('pv-spare', 2)).toHaveTextContent('No claim');
      expect(cell('pv-old', 1)).toHaveTextContent('Released');
      expect(within(cell('pv-old', 2)).getByRole('link', { name: 'old-reports' })).toBeInTheDocument();
      expect(within(cell('pv-uploads', 2)).getByRole('link', { name: 'uploads' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/ns/shop/persistentvolumeclaims/uploads',
      );
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'PV-1: CSI volume details show the source, node affinity, StorageClass and claim',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/persistentvolumes/pv-db-data');

      await screen.findByRole('heading', { name: 'PersistentVolume details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(detailsRow('Reclaim policy')).toHaveTextContent('Delete');
      expect(detailsRow('Capacity')).toHaveTextContent('10Gi');
      expect(detailsRow('Access modes')).toHaveTextContent('ReadWriteOnce');
      expect(detailsRow('Volume mode')).toHaveTextContent('Filesystem');
      expect(within(detailsRow('StorageClass')).getByRole('link', { name: 'standard-csi' })).toBeInTheDocument();
      expect(within(detailsRow('PersistentVolumeClaim')).getByRole('link', { name: 'db-data' })).toBeInTheDocument();
      expect(detailsRow('Node affinity')).toHaveTextContent('topology.kubernetes.io/zone In zone-a');
      expect(detailsRow('Source')).toHaveTextContent('csi: csi.example.com');
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'PV-1: NFS volume details show server:path as the source',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/persistentvolumes/pv-uploads');

      await screen.findByRole('heading', { name: 'PersistentVolume details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(detailsRow('Source')).toHaveTextContent('nfs: nfs.example.com:/exports/uploads');
      expect(detailsRow('Reclaim policy')).toHaveTextContent('Retain');
      expect(screen.queryByText('Node affinity')).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
