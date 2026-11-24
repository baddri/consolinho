import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { PersistentVolumeClaimModel, setWatchTimingForTests, type K8sResource, type PersistentVolumeClaim } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockK8s, problem, setMockUser } from '@/test/handlers';
import { renderApp, renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { ResourceActionsMenu } from '../../actions/ResourceActionsMenu';
import { ResourceRowActions } from '../../actions/ResourceRowActions';
import { persistentVolumeClaimDescriptor } from '../../registry/kinds/persistentvolumeclaims';
import { resourceRoutes } from '../../routes';
import { initialExpandSize, minExpandValue, validateExpandSize } from './expandSize';
import { ExpandPVCModal } from './ExpandPVCModal';
import { NO_EXPANSION_REASON, NOT_BOUND_REASON } from './useExpandPVCAction';

const PROXY = '*/api/clusters/:cluster/k8s/*';

beforeAll(() => preloadLazyRoutes(resourceRoutes));
beforeEach(() => {
  onTestFinished(
    setWatchTimingForTests({ flushMs: 10, initialBackoffMs: 20, maxBackoffMs: 40, minStreamMs: 100 }),
  );
});
afterEach(() => server.events.removeAllListeners());

/** Claim `name` in `shop` on `cluster`, as the mock stores it. */
function claim(name: string, cluster = 'dev-1'): PersistentVolumeClaim & K8sResource {
  const obj = mockK8s.get(cluster, PersistentVolumeClaimModel, 'shop', name);
  if (!obj) throw new Error(`fixture PVC ${name} missing`);
  return obj as PersistentVolumeClaim & K8sResource;
}

/** The details "Capacity" row (`dt` + `dd`). */
function capacityRow(): HTMLElement {
  const row = screen.getByText('Capacity', { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error('no Capacity row');
  return row;
}

/** Records the path and body of every PATCH the proxy receives. */
function recordPatches(): { path: string; body: unknown }[] {
  const patches: { path: string; body: unknown }[] = [];
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'PATCH') return;
    const path = new URL(request.url).pathname;
    void request
      .clone()
      .json()
      .then((body: unknown) => patches.push({ path, body }));
  });
  return patches;
}

describe('validateExpandSize (QG5A-1)', () => {
  it.each([
    ['equal', '10', 'Gi', '10Gi', 'Size must be greater than the current size (10Gi).'],
    ['smaller', '5', 'Gi', '10Gi', 'Size must be greater than the current size (10Gi).'],
    ['larger', '20', 'Gi', '10Gi', undefined],
    ['other unit, larger', '1', 'Ti', '10Gi', undefined],
    ['other unit, smaller', '9000', 'Mi', '10Gi', 'Size must be greater than the current size (10Gi).'],
    ['decimal, larger', '10.5', 'Gi', '10Gi', undefined],
    ['decimal current', '1', 'Gi', '1.5Gi', 'Size must be greater than the current size (1.5Gi).'],
    ['empty', '', 'Gi', '10Gi', 'Size must be a positive number.'],
    ['zero', '0', 'Gi', '10Gi', 'Size must be a positive number.'],
    ['negative', '-1', 'Gi', '10Gi', 'Size must be a positive number.'],
  ] as const)('%s', (_case, value, unit, current, expected) => {
    expect(validateExpandSize(value, unit, current)).toBe(expected);
  });

  it('only checks positivity without a parsable current request', () => {
    expect(validateExpandSize('1', 'Mi', undefined)).toBeUndefined();
  });

  it('minExpandValue is the current request in the chosen unit', () => {
    expect(minExpandValue('10Gi', 'Gi')).toBe(10);
    expect(minExpandValue('10Gi', 'Mi')).toBe(10240);
    expect(minExpandValue(undefined, 'Gi')).toBe(0);
  });

  it('initialExpandSize splits the request into OCP value + unit', () => {
    expect(initialExpandSize('10Gi')).toEqual({ value: '10', unit: 'Gi' });
    expect(initialExpandSize('512Mi')).toEqual({ value: '512', unit: 'Mi' });
    expect(initialExpandSize('1536Mi')).toEqual({ value: '1.5', unit: 'Gi' });
    expect(initialExpandSize('2Ti')).toEqual({ value: '2', unit: 'Ti' });
    expect(initialExpandSize(undefined)).toEqual({ value: '', unit: 'Gi' });
  });
});

describe('Expand PVC (T-0308, PVC-3)', () => {
  it(
    'RW expands db-data 10Gi to 20Gi; the toast names claim and cluster and capacity updates live',
    async () => {
      const patches = recordPatches();
      const { user } = renderApp('/c/dev-1/k8s/ns/shop/persistentvolumeclaims/db-data');

      const actions = await screen.findByRole('button', { name: 'Actions' }, { timeout: COLD_START_TIMEOUT_MS });
      await user.click(actions);
      const item = screen.getByRole('menuitem', { name: 'Expand PVC' });
      await waitFor(() => expect(item).not.toHaveAttribute('aria-disabled', 'true'));
      await user.click(item);

      const dialog = await screen.findByRole('dialog', { name: 'Expand PersistentVolumeClaim' });
      const input = within(dialog).getByRole('spinbutton', { name: 'Total size' });
      await waitFor(() => expect(input).toHaveFocus());
      expect(input).toHaveValue(10);
      expect(within(dialog).getByRole('button', { name: 'Number of GiB' })).toBeInTheDocument();
      await user.clear(input);
      await user.type(input, '20');
      await user.click(within(dialog).getByRole('button', { name: 'Expand' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(patches).toEqual([
        {
          path: '/api/clusters/dev-1/k8s/api/v1/namespaces/shop/persistentvolumeclaims/db-data',
          body: [{ op: 'replace', path: '/spec/resources/requests', value: { storage: '20Gi' } }],
        },
      ]);
      expect(await screen.findByText(/^Expansion of db-data to 20Gi requested on /)).toBeInTheDocument();
      await waitFor(() => expect(claim('db-data').status?.capacity?.storage).toBe('20Gi'));
      await waitFor(() => expect(capacityRow()).toHaveTextContent('20 GiB'));
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it('RO grant: Expand PVC stays visible, disabled with the read-only reason', async () => {
    setMockUser('alice');
    const { user } = renderWithProviders(
      <ResourceActionsMenu
        cluster="prod-eu-1"
        descriptor={persistentVolumeClaimDescriptor}
        obj={claim('db-data', 'prod-eu-1')}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = screen.getByRole('menuitem', { name: 'Expand PVC' });
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Your access to prod-eu-1 is read-only.');
    await user.click(item);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a Pending claim (scratch) is disabled "PVC is not Bound" in its list row', async () => {
    const { user } = renderWithProviders(
      <ResourceRowActions cluster="dev-1" descriptor={persistentVolumeClaimDescriptor} obj={claim('scratch')} />,
    );

    await user.click(screen.getByRole('button', { name: 'Kebab toggle' }));
    const item = await screen.findByRole('menuitem', { name: 'Expand PVC' });
    await waitFor(() => expect(item).toHaveAttribute('aria-disabled', 'true'));
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(NOT_BOUND_REASON);
  });

  it('list rows read no StorageClass; on details uploads (slow-nfs) is disabled with the SC reason', async () => {
    const scRequests: string[] = [];
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.includes('/storageclasses')) scRequests.push(request.url);
    });
    const row = renderWithProviders(
      <ResourceRowActions cluster="dev-1" descriptor={persistentVolumeClaimDescriptor} obj={claim('uploads')} />,
    );
    await row.user.click(screen.getByRole('button', { name: 'Kebab toggle' }));
    const rowItem = await screen.findByRole('menuitem', { name: 'Expand PVC' });
    await waitFor(() => expect(rowItem).not.toHaveAttribute('aria-disabled', 'true'));
    expect(scRequests).toEqual([]);
    row.unmount();

    const { user } = renderWithProviders(
      <ResourceActionsMenu cluster="dev-1" descriptor={persistentVolumeClaimDescriptor} obj={claim('uploads')} />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = screen.getByRole('menuitem', { name: 'Expand PVC' });
    await user.hover(item);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(NO_EXPANSION_REASON);
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });

  it('SAFE5-1: the modal names the cluster; a size not above the current one blocks Expand', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <ExpandPVCModal cluster="dev-1" pvc={claim('db-data')} onClose={onClose} />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Expand PersistentVolumeClaim' });
    await waitFor(() =>
      expect(dialog).toHaveTextContent('PersistentVolumeClaim db-data in shop on Development 1'),
    );
    expect(dialog).toHaveTextContent(
      'Increase the capacity of PVC db-data. Note that capacity must be at least the current PVC size.',
    );
    const input = within(dialog).getByRole('spinbutton', { name: 'Total size' });
    await user.clear(input);
    await user.type(input, '10');
    expect(await within(dialog).findByText('Size must be greater than the current size (10Gi).')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Expand' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Number of GiB' }));
    await user.click(screen.getByRole('option', { name: 'TiB' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Expand' })).toBeEnabled());
  });

  it('ACT-6: a cluster failure shows inline and keeps the modal open', async () => {
    server.use(http.patch(PROXY, () => problem(403, { code: 'Kubernetes.Forbidden', detail: 'quota exceeded' })));
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <ExpandPVCModal cluster="dev-1" pvc={claim('db-data')} onClose={onClose} />,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Expand PersistentVolumeClaim' });
    await user.click(within(dialog).getByRole('button', { name: 'Increment' }));
    await user.click(within(dialog).getByRole('button', { name: 'Expand' }));
    expect(await within(dialog).findByText('An error occurred')).toBeInTheDocument();
    expect(within(dialog).getByText('quota exceeded')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
