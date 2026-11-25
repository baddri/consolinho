import { screen, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import type { Machine } from '@/shared/k8s';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { machinePhase, machineProviderState } from './machine';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

const NS = '/c/dev-1/k8s/ns/openshift-machine-api';
const WORKER_1 = 'dev-1-x7k2p-worker-us-east-1a-b8v2r';

/** The details row (`DescriptionListGroup`) labelled `label`. */
function detailsRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

/** A bare Machine with `status`. */
function machine(status?: Machine['status']): Machine {
  return { apiVersion: 'machine.openshift.io/v1beta1', kind: 'Machine', metadata: {}, status };
}

describe('machine helpers', () => {
  it('machinePhase shows Running as "Provisioned as node" and other phases as is', () => {
    expect(machinePhase(machine({ phase: 'Running' }))).toBe('Provisioned as node');
    expect(machinePhase(machine({ phase: 'Provisioning' }))).toBe('Provisioning');
    expect(machinePhase(machine())).toBeUndefined();
  });

  it('machineProviderState reads a string instanceState only', () => {
    const withState = (instanceState: unknown) => {
      const providerStatus = { instanceState, conditions: [] };
      return machine({ providerStatus });
    };
    expect(machineProviderState(withState('running'))).toBe('running');
    expect(machineProviderState(withState(3))).toBeUndefined();
    expect(machineProviderState(machine())).toBeUndefined();
  });
});

describe('Machines (T-0334)', () => {
  it(
    'MS-1: the list shows OCP columns, the Node link and no row actions',
    async () => {
      renderApp(`${NS}/machines`);
      const table = await screen.findByRole('grid', { name: 'Machines' }, { timeout: COLD_START_TIMEOUT_MS });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Node', 'Phase', 'Provider state', 'Region', 'Availability zone']);
      const row = (await within(table).findByRole('link', { name: WORKER_1 })).closest('tr');
      if (!row) throw new Error('no worker machine row');
      const cells = within(row).getAllByRole('cell');
      expect(within(cells[1] ?? row).getByRole('link', { name: 'worker-1' })).toHaveAttribute(
        'href',
        '/c/dev-1/k8s/cluster/nodes/worker-1',
      );
      expect(cells[2]).toHaveTextContent('Provisioned as node');
      expect(cells[3]).toHaveTextContent('running');
      expect(cells[4]).toHaveTextContent('us-east-1');
      expect(cells[5]).toHaveTextContent('us-east-1a');
      expect(within(row).queryByRole('button', { name: /actions/i })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'MS-2: details show phase, provider state, node, placement, addresses and conditions',
    async () => {
      renderApp(`${NS}/machines/${WORKER_1}`);
      await screen.findByRole('heading', { name: 'Machine details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(detailsRow('Phase')).toHaveTextContent('Provisioned as node');
      expect(detailsRow('Provider state')).toHaveTextContent('running');
      expect(within(detailsRow('Node')).getByRole('link', { name: 'worker-1' })).toBeInTheDocument();
      expect(detailsRow('Machine role')).toHaveTextContent('worker');
      expect(detailsRow('Instance type')).toHaveTextContent('m6i.2xlarge');
      expect(detailsRow('Region')).toHaveTextContent('us-east-1');
      expect(detailsRow('Availability zone')).toHaveTextContent('us-east-1a');
      expect(detailsRow('Machine addresses')).toHaveTextContent('Internal IP: 10.0.1.21');
      expect(screen.getByRole('heading', { name: 'Conditions' })).toBeInTheDocument();
      expect(screen.getByText('MachineCreation')).toBeInTheDocument();
      // MS-3: read-only, so the details Actions menu offers no Edit/Delete (it is absent without kind actions).
      expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'MS-4: a cluster without the Machine API shows the not-served state',
    async () => {
      renderApp('/c/prod-k8s-1/k8s/ns/openshift-machine-api/machines');
      expect(
        await screen.findByRole(
          'heading',
          { name: "Machines aren't available on prod-k8s-1", level: 1 },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
