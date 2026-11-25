import { screen, within } from '@testing-library/react';
import type { StorageClass } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { allowsExpansion, isDefaultClass } from './storageClass';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** A StorageClass with the given annotations and expansion flag. */
function sc(annotations?: Record<string, string>, allowVolumeExpansion?: boolean): StorageClass {
  return { metadata: { name: 'sc', annotations }, provisioner: 'p', allowVolumeExpansion };
}

/** The details row (`DescriptionListGroup`) labelled `label`. */
function detailsRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

describe('storageClass helpers', () => {
  it('isDefaultClass accepts the GA or beta annotation set to "true" only', () => {
    expect(isDefaultClass(sc({ 'storageclass.kubernetes.io/is-default-class': 'true' }))).toBe(true);
    expect(isDefaultClass(sc({ 'storageclass.beta.kubernetes.io/is-default-class': 'true' }))).toBe(true);
    expect(isDefaultClass(sc({ 'storageclass.kubernetes.io/is-default-class': 'false' }))).toBe(false);
    expect(isDefaultClass(sc())).toBe(false);
  });

  it('allowsExpansion is true only when allowVolumeExpansion is set', () => {
    expect(allowsExpansion(sc(undefined, true))).toBe(true);
    expect(allowsExpansion(sc(undefined, false))).toBe(false);
    expect(allowsExpansion(sc())).toBe(false);
  });
});

describe('StorageClasses (T-0306)', () => {
  it(
    'SC-1: the list shows OCP columns and the Default marker on the default class',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/storageclasses');

      const table = await screen.findByRole(
        'grid',
        { name: 'StorageClasses' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Provisioner', 'Reclaim policy', 'Actions']);
      const row = (await within(table).findByRole('link', { name: 'standard-csi' })).closest('tr');
      if (!row) throw new Error('no standard-csi row');
      const cells = within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
      expect(cells[0]).toContain('standard-csi– Default');
      expect(cells.slice(1, 3)).toEqual(['csi.example.com', 'Delete']);
      const nfsRow = within(table).getByRole('link', { name: 'slow-nfs' }).closest('tr');
      if (!nfsRow) throw new Error('no slow-nfs row');
      expect(nfsRow).not.toHaveTextContent('Default');
      expect(nfsRow).toHaveTextContent('Retain');
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'SC-1: details show provisioner, binding mode, expansion, default class and Parameters',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/storageclasses/standard-csi');

      await screen.findByRole(
        'heading',
        { name: 'StorageClass details' },
        { timeout: COLD_START_TIMEOUT_MS },
      );
      expect(detailsRow('Provisioner')).toHaveTextContent('csi.example.com');
      expect(detailsRow('Reclaim policy')).toHaveTextContent('Delete');
      expect(detailsRow('Default class')).toHaveTextContent('True');
      expect(detailsRow('Volume binding mode')).toHaveTextContent('WaitForFirstConsumer');
      expect(detailsRow('Allow volume expansion')).toHaveTextContent('true');
      expect(screen.getByRole('heading', { name: 'Parameters' })).toBeInTheDocument();
      const parameters = screen.getByRole('grid', { name: 'Parameters' });
      expect(
        within(parameters).getByRole('row', { name: /csi\.storage\.k8s\.io\/fstype xfs/ }),
      ).toBeInTheDocument();
      expect(within(parameters).getByRole('row', { name: /type ssd/ })).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
