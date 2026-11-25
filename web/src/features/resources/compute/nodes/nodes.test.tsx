import { render, screen, waitFor, within } from '@testing-library/react';
import type { Node } from '@/shared/k8s';
import { COLD_START_TEST_TIMEOUT_MS, COLD_START_TIMEOUT_MS, preloadLazyRoutes } from '@/test/coldStart';
import { mockDb } from '@/test/handlers';
import { renderApp } from '@/test/render';
import { resourceRoutes } from '../../routes';
import { nodeAddresses, nodeUptime, nodeMachine, nodeProvider, nodeResourceRows, nodeRoles } from './node';
import { nodeImageName, NodeImagesTable } from './NodeImagesTable';
import { NodeStatus } from './NodeStatus';

beforeAll(() => preloadLazyRoutes(resourceRoutes));

/** Gives `admin` a grant on `clusterName` (fixtures grant only dev-1 and prod-k8s-1), as `distributionDiscovery.test`. */
function grantAdminOn(clusterName: string): void {
  const cluster = mockDb.clusters.find((c) => c.name === clusterName);
  const [credential] = mockDb.credentials;
  const [grant] = mockDb.grants;
  if (!cluster || !credential || !grant)
    throw new Error(`fixtures lack ${clusterName}, a credential or a grant`);
  cluster.isEnabled = true;
  mockDb.credentials.push({ ...structuredClone(credential), id: `cred-${clusterName}`, clusterName });
  mockDb.grants.push({
    ...structuredClone(grant),
    id: `grant-${clusterName}`,
    subjectName: 'admin',
    clusterName,
    credentialId: `cred-${clusterName}`,
  });
}

/** A node whose Ready condition has `ready` (none when `undefined`), optionally cordoned. */
function node(ready: string | undefined, unschedulable?: boolean): Node {
  return {
    metadata: { name: 'n' },
    spec: unschedulable === undefined ? {} : { unschedulable },
    status: {
      conditions: ready === undefined ? [] : [{ type: 'Ready', status: ready, lastTransitionTime: 't0' }],
    },
  };
}

/** The details row (`DescriptionListGroup`) labelled `label`. */
function detailsRow(label: string): HTMLElement {
  const row = screen.getByText(label, { selector: 'dt *, dt' }).closest('div');
  if (!row) throw new Error(`no details row ${label}`);
  return row;
}

/** Link names of the first column of `table`'s body rows. */
function nodeNames(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).queryAllByRole('link')[0]?.textContent ?? '');
}

describe('NodeStatus (NODE-2)', () => {
  it.each([
    ['True', 'Ready'],
    ['False', 'Not Ready'],
    ['Unknown', 'Not Ready'],
    [undefined, 'Not Ready'],
  ])('Ready %s shows %s', (ready, text) => {
    render(<NodeStatus node={node(ready)} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText('Scheduling disabled')).not.toBeInTheDocument();
  });

  it('adds "Scheduling disabled" under the status while cordoned', () => {
    render(<NodeStatus node={node('True', true)} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Scheduling disabled')).toBeInTheDocument();
  });
});

describe('node helpers', () => {
  it('nodeRoles reads node-role labels, sorted', () => {
    const labels = {
      'node-role.kubernetes.io/master': '',
      'node-role.kubernetes.io/control-plane': '',
      'kubernetes.io/arch': 'amd64',
    };
    expect(nodeRoles({ metadata: { labels } })).toEqual(['control-plane', 'master']);
    expect(nodeRoles({ metadata: {} })).toEqual([]);
  });

  it('nodeMachine parses `<ns>/<name>` and ignores a missing or partial annotation', () => {
    const annotated = (value: string): Node => ({
      metadata: { annotations: { 'machine.openshift.io/machine': value } },
    });
    expect(nodeMachine(annotated('openshift-machine-api/m-1'))).toEqual({
      namespace: 'openshift-machine-api',
      name: 'm-1',
    });
    expect(nodeMachine(annotated('m-1'))).toBeUndefined();
    expect(nodeMachine({ metadata: {} })).toBeUndefined();
  });

  it('nodeProvider names AWS; nodeUptime is the Ready=True transition only', () => {
    expect(nodeProvider({ spec: { providerID: 'aws:///us-east-1a/i-0abc' } })).toBe('Amazon Web Services');
    expect(nodeProvider({ spec: { providerID: 'gce://p/z/n' } })).toBe('gce');
    expect(nodeProvider({ spec: {} })).toBeUndefined();
    expect(nodeUptime(node('True'))).toBe('t0');
    expect(nodeUptime(node('False'))).toBeUndefined();
  });

  it('nodeAddresses sorts by type and spaces the type words', () => {
    const addresses = [
      { type: 'InternalIP', address: '10.0.0.1' },
      { type: 'Hostname', address: 'n' },
      { type: 'ExternalIP', address: '' },
    ];
    expect(nodeAddresses({ status: { addresses } })).toEqual([
      { type: 'Hostname', address: 'n' },
      { type: 'Internal IP', address: '10.0.0.1' },
    ]);
  });

  it('nodeImageName prefers a tag name over digest and <none> names, else the first (OCP NodeDetailsImages)', () => {
    expect(nodeImageName(['reg/a@sha256:1', 'reg/a:v1'])).toBe('reg/a:v1');
    expect(nodeImageName(['reg/a@sha256:1', 'reg/a:<none>'])).toBe('reg/a@sha256:1');
    expect(nodeImageName(['reg/a@sha256:1'])).toBe('reg/a@sha256:1');
  });

  it('NodeImagesTable skips entries without names and shows "-" for a missing size', () => {
    render(<NodeImagesTable images={[{ names: ['reg/a:v1'] }, { sizeBytes: 5 }]} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('reg/a:v1-');
  });

  it('nodeResourceRows humanises CPU, memory and storage', () => {
    const rows = nodeResourceRows({
      status: {
        capacity: { cpu: '8', memory: '32Gi', 'ephemeral-storage': '100Gi', pods: '250' },
        allocatable: { cpu: '7500m', memory: '31Gi', pods: '250' },
      },
    });
    expect(rows).toEqual([
      { resource: 'CPU', capacity: '8 cores', allocatable: '7.5 cores' },
      { resource: 'Memory', capacity: '32 GiB', allocatable: '31 GiB' },
      { resource: 'Ephemeral storage', capacity: '100 GiB', allocatable: undefined },
      { resource: 'Pods', capacity: '250', allocatable: '250' },
    ]);
  });
});

describe('Nodes (T-0332)', () => {
  it(
    'NODE-2: the list shows OCP columns and dev-2 worker-3 Not Ready',
    async () => {
      grantAdminOn('dev-2');
      renderApp('/c/dev-2/k8s/cluster/nodes');

      const table = await screen.findByRole('grid', { name: 'Nodes' }, { timeout: COLD_START_TIMEOUT_MS });
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent.replace(/Column \d+ pixels$/, ''));
      expect(headers).toEqual([
        'Name',
        'Status',
        'Roles',
        'Instance type',
        'Zone',
        'Architecture',
        'Created',
        'Actions',
      ]);
      const link = await within(table).findByRole('link', { name: 'worker-3' });
      const row = link.closest('tr');
      if (!row) throw new Error('no worker-3 row');
      const cells = within(row).getAllByRole('cell');
      expect(cells[1]).toHaveTextContent('Not Ready');
      expect(cells[2]).toHaveTextContent('worker');
      expect(cells[3]).toHaveTextContent('m6i.2xlarge');
      expect(cells[4]).toHaveTextContent('us-east-1b');
      expect(cells[5]).toHaveTextContent('amd64');
      const controlPlane = within(table).getByRole('link', { name: 'control-plane-1' }).closest('tr');
      expect(controlPlane).toHaveTextContent('control-plane, master');
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'NODE-2: Status and Roles filters restore from the URL',
    async () => {
      grantAdminOn('dev-2');
      renderApp('/c/dev-2/k8s/cluster/nodes?status=Not%20Ready');
      const table = await screen.findByRole('grid', { name: 'Nodes' }, { timeout: COLD_START_TIMEOUT_MS });
      await waitFor(() => expect(nodeNames(table)).toEqual(['worker-3']));
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'NODE-2: the Roles filter keeps only control-plane nodes',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/nodes?roles=control-plane');
      const table = await screen.findByRole('grid', { name: 'Nodes' }, { timeout: COLD_START_TIMEOUT_MS });
      await waitFor(() =>
        expect(nodeNames(table).sort()).toEqual(['control-plane-1', 'control-plane-2', 'control-plane-3']),
      );
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'NODE-3: OpenShift node details show the Machine link, node info, conditions and capacity',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/nodes/worker-1');

      await screen.findByRole('heading', { name: 'Node details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(detailsRow('Taints')).toHaveTextContent('0 Taints');
      expect(within(detailsRow('Machine')).getByRole('link')).toHaveAttribute(
        'href',
        expect.stringMatching(
          /\/c\/dev-1\/k8s\/ns\/openshift-machine-api\/.*machines\/dev-1-x7k2p-worker-us-east-1a-b8v2r$/,
        ),
      );
      expect(detailsRow('Provider ID')).toHaveTextContent('Amazon Web Services');
      expect(detailsRow('Status')).toHaveTextContent('Ready');
      expect(screen.queryByText('Roles', { selector: 'dt *, dt' })).not.toBeInTheDocument();
      expect(screen.queryByText('Owner', { selector: 'dt *, dt' })).not.toBeInTheDocument();
      expect(screen.queryByText('Unschedulable', { selector: 'dt *, dt' })).not.toBeInTheDocument();
      expect(detailsRow('Node name')).toHaveTextContent('worker-1');
      expect(detailsRow('Annotations')).toHaveTextContent('1 Annotation');
      expect(detailsRow('Kube-proxy version')).toHaveTextContent('v1.30.4');
      expect(detailsRow('Boot ID')).toHaveTextContent('-boot');
      expect(detailsRow('Created')).toBeInTheDocument();
      // OCP order: metadata interleaved with node fields, Taints before Annotations.
      const terms = within(screen.getByLabelText('Metadata'))
        .getAllByRole('term')
        .map((term) => term.textContent);
      expect(terms.indexOf('Taints')).toBeLessThan(terms.indexOf('Annotations'));
      expect(terms.at(-1)).toBe('Created');
      expect(detailsRow('Node addresses')).toHaveTextContent('Internal IP: 10.0.1.21');
      expect(detailsRow('Operating system')).toHaveTextContent('Linux');
      expect(detailsRow('Kubelet version')).toHaveTextContent('v1.30.4');
      expect(detailsRow('Container runtime')).toHaveTextContent('cri-o://1.30.4');

      expect(screen.getByRole('heading', { name: 'Node conditions' })).toBeInTheDocument();
      const conditions = screen.getByRole('grid', { name: 'Node conditions' });
      expect(within(conditions).getByText('KubeletReady')).toBeInTheDocument();
      const conditionHeaders = within(conditions)
        .getAllByRole('columnheader')
        .map((header) => header.textContent);
      expect(conditionHeaders).toEqual(['Type', 'Status', 'Reason', 'Updated', 'Changed']);
      const capacity = screen.getByRole('grid', { name: 'Capacity and allocatable' });
      const cpu = within(capacity).getByText('CPU').closest('tr');
      expect(cpu).toHaveTextContent('8 cores7.5 cores');

      // OCP NodeDetailsImages: last section, Name | Size; tag names preferred, digest-only names fall back.
      const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
      expect(headings.at(-1)).toBe('Images');
      const images = screen.getByRole('grid', { name: 'Images' });
      expect(within(images).getByText('quay.example.com/fleet/ose-cli:v4.18').closest('tr')).toHaveTextContent(
        '1.25 GiB',
      );
      expect(within(images).getByText(/ovn-kubernetes@sha256:/)).toBeInTheDocument();
      expect(within(images).getAllByRole('row')).toHaveLength(5);
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'NODE-3: a cordoned node shows Scheduling disabled and the Unschedulable row',
    async () => {
      renderApp('/c/dev-1/k8s/cluster/nodes/worker-2');

      await screen.findByRole('heading', { name: 'Node details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(detailsRow('Status')).toHaveTextContent('Scheduling disabled');
      expect(detailsRow('Unschedulable')).toHaveTextContent('True');
      expect(detailsRow('Taints')).toHaveTextContent('1 Taint');
    },
    COLD_START_TEST_TIMEOUT_MS,
  );

  it(
    'NODE-3: a vanilla Kubernetes node has no Machine row',
    async () => {
      renderApp('/c/prod-k8s-1/k8s/cluster/nodes/worker-1');

      await screen.findByRole('heading', { name: 'Node details' }, { timeout: COLD_START_TIMEOUT_MS });
      expect(detailsRow('Provider ID')).toBeInTheDocument();
      expect(screen.queryByText('Machine', { selector: 'dt *, dt' })).not.toBeInTheDocument();
    },
    COLD_START_TEST_TIMEOUT_MS,
  );
});
