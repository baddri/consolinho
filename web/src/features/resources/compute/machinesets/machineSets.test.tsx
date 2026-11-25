import { screen, waitFor, within } from '@testing-library/react';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import type { MachineSet } from '@/shared/k8s';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import {
  cpuText,
  desiredMachines,
  machineSetCpu,
  machineSetInstanceType,
  machineSetMemoryGiB,
  memoryText,
} from './machineSet';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

const NS = '/c/dev-1/k8s/ns/openshift-machine-api';
const SET_A = 'dev-1-x7k2p-worker-us-east-1a';

/** The details row (`DescriptionListGroup`) labelled `label`. */
function detailsRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

/** A bare MachineSet with `spec` and `annotations`. */
function machineSet(spec?: MachineSet['spec'], annotations?: Record<string, string>): MachineSet {
  return { apiVersion: 'machine.openshift.io/v1beta1', kind: 'MachineSet', metadata: { annotations }, spec };
}

describe('machine set helpers', () => {
  it('reads the instance type of any provider and defaults desired replicas to 1', () => {
    const withValue = (value: Record<string, unknown>) => machineSet({ template: { spec: { providerSpec: { value } } } });
    expect(machineSetInstanceType(withValue({ vmSize: 'Standard_D4s_v3' }))).toBe('Standard_D4s_v3');
    expect(machineSetInstanceType(withValue({ machineType: 'n2-standard-4' }))).toBe('n2-standard-4');
    expect(machineSetInstanceType(withValue({}))).toBeUndefined();
    expect(desiredMachines(machineSet())).toBe(1);
    expect(desiredMachines(machineSet({ replicas: 0 }))).toBe(0);
  });

  it('reads CPU and memory from the capacity annotations, ignoring malformed ones', () => {
    const annotated = (annotations: Record<string, string>) => machineSet(undefined, annotations);
    const set = annotated({ 'machine.openshift.io/vCPU': '4', 'machine.openshift.io/memoryMb': '16384' });
    expect(machineSetCpu(set)).toBe(4);
    expect(machineSetMemoryGiB(set)).toBe(16);
    expect(machineSetCpu(annotated({ 'machine.openshift.io/vCPU': 'x' }))).toBeUndefined();
    expect(machineSetMemoryGiB(annotated({}))).toBeUndefined();
    expect(cpuText(1)).toBe('1 core');
    expect(memoryText(7.5)).toBe('7.50 GiB');
  });
});

describe('MachineSets (T-0334)', () => {
  it(
    'MS-1: the list shows OCP columns with "R of D machines" linking to the Machines tab',
    async () => {
      renderApp(`${NS}/machinesets`);
      const table = await screen.findByRole('grid', { name: 'MachineSets' }, { timeout: COLD_START_TIMEOUT_MS });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual(['Name', 'Machines', 'Instance type', 'CPU', 'Memory']);
      const row = (await within(table).findByRole('link', { name: SET_A })).closest('tr');
      if (!row) throw new Error('no machine set row');
      expect(within(row).getByRole('link', { name: '2 of 2 machines' })).toHaveAttribute(
        'href',
        `${NS}/machinesets/${SET_A}/machines`,
      );
      expect(row).toHaveTextContent('m6i.2xlarge');
      expect(row).toHaveTextContent('8 cores');
      expect(row).toHaveTextContent('32.00 GiB');
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'MS-2: details show the machine counts, selector, instance type and placement',
    async () => {
      renderApp(`${NS}/machinesets/${SET_A}`);
      await screen.findByRole('heading', { name: 'MachineSet details' }, { timeout: COLD_START_TIMEOUT_MS });
      const counts = screen.getByLabelText('Machine counts');
      expect(within(counts).getByText('Desired count').closest('dt')?.nextElementSibling).toHaveTextContent('2 machines');
      expect(within(counts).getByText('Ready count').closest('dt')?.nextElementSibling).toHaveTextContent('2 machines');
      expect(within(detailsRow('Selector')).getByRole('link')).toHaveAttribute(
        'href',
        expect.stringContaining(`${NS}/machines?label=`),
      );
      expect(detailsRow('Instance type')).toHaveTextContent('m6i.2xlarge');
      expect(detailsRow('Region')).toHaveTextContent('us-east-1');
      expect(detailsRow('Availability zone')).toHaveTextContent('us-east-1a');
      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs).toEqual(['Details', 'YAML', 'Machines', 'Events']);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'MS-2: the Machines tab lists only the set\'s machines',
    async () => {
      renderApp(`${NS}/machinesets/${SET_A}/machines`);
      const table = await screen.findByRole('grid', { name: 'Machines' }, { timeout: COLD_START_TIMEOUT_MS });
      await waitFor(() => {
        const names = within(table)
          .getAllByRole('row')
          .slice(1)
          .map((row) => within(row).queryAllByRole('link')[0]?.textContent ?? '');
        expect(names.sort()).toEqual([`${SET_A}-b8v2r`, `${SET_A}-k4n7q`]);
      });
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'MS-4: a cluster without the Machine API shows the not-served state',
    async () => {
      renderApp('/c/prod-k8s-1/k8s/ns/openshift-machine-api/machinesets');
      expect(
        await screen.findByRole(
          'heading',
          { name: "MachineSets aren't available on prod-k8s-1", level: 1 },
          { timeout: COLD_START_TIMEOUT_MS },
        ),
      ).toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
