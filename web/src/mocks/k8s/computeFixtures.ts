import type { NodeCondition, PodStatus, Taint } from 'kubernetes-types/core/v1';
import type {
  DaemonSet,
  K8sResource,
  Machine,
  MachineSet,
  Node,
  OwnerReference,
  Pod,
  ReplicaSet,
} from '@/shared/k8s';
import { FIXTURE_NOW } from '../fixtures/time';
import { k8sTime, runningPodStatus } from './fixtures';

/**
 * CP5b compute fixtures (T-0331, Lane C owns this file afterwards): per cluster 3 control-plane and 3 worker Nodes
 * (`worker-1..3`, the nodes the workload pods already name), the pods running on each worker — a DaemonSet pod, a
 * ReplicaSet pod and a bare pod, so the Node Pods tab (NODE-4) has every owner shape — and, on OpenShift clusters,
 * the Machine API objects in `openshift-machine-api`: two worker MachineSets with their Machines plus the control-plane
 * Machines, each linked to its Node. Vanilla clusters get Nodes and pods only.
 *
 * Scenario (mirrors the MSW fleet table, T-0341): on `dev-2` worker-3 is NotReady (Ready False: the kubelet reports
 * that the network plugin isn't ready, so the node controller taints it `not-ready`); on `dev-1` worker-2 is cordoned
 * (`spec.unschedulable` plus the `unschedulable` taint), so "Scheduling disabled" and the Unschedulable row show on a
 * cluster the mock admin is granted.
 */

const MINUTE_MS = 60_000;
const DAY_MINUTES = 60 * 24;
const MACHINE_API_NAMESPACE = 'openshift-machine-api';
const NODE_POD_NAMESPACE = 'openshift-monitoring';
const BARE_POD_NAMESPACE = 'kube-system';
const KUBELET_VERSION = 'v1.30.4';
const REGION = 'us-east-1';
const NOT_READY: ReadonlySet<string> = new Set(['dev-2/worker-3']);
const CORDONED: ReadonlySet<string> = new Set(['dev-1/worker-2']);

function minutesBefore(minutes: number): string {
  return k8sTime(FIXTURE_NOW - minutes * MINUTE_MS);
}

/** A controller owner reference, as the controllers write it. */
function ownedBy(apiVersion: string, kind: string, name: string, uid: string): OwnerReference[] {
  return [{ apiVersion, kind, name, uid, controller: true, blockOwnerDeletion: true }];
}

/** One planned node: name, role, zone, instance type, IP and (OpenShift) the Machine/MachineSet behind it. */
interface NodePlan {
  name: string;
  role: 'master' | 'worker';
  zone: string;
  instanceType: string;
  ip: string;
  machine: string;
  machineSet?: string;
}

/** Infrastructure name of `cluster`, the prefix of its Machine API objects (OpenShift `<cluster>-<5 chars>`). */
export function infrastructureName(cluster: string): string {
  return `${cluster}-x7k2p`;
}

function workerSetName(cluster: string, zone: string): string {
  return `${infrastructureName(cluster)}-worker-${zone}`;
}

function nodePlans(cluster: string): NodePlan[] {
  const infra = infrastructureName(cluster);
  const zones = [`${REGION}a`, `${REGION}b`, `${REGION}c`];
  const controlPlane = zones.map((zone, index): NodePlan => ({
    name: `control-plane-${index + 1}`,
    role: 'master',
    zone,
    instanceType: 'm6i.xlarge',
    ip: `10.0.0.${11 + index}`,
    machine: `${infra}-master-${index}`,
  }));
  // worker-1 and worker-2 from the zone-a set (2 replicas), worker-3 from the zone-b set (1 replica).
  const workerZones = [zones[0] ?? '', zones[0] ?? '', zones[1] ?? ''];
  const workers = workerZones.map((zone, index): NodePlan => ({
    name: `worker-${index + 1}`,
    role: 'worker',
    zone,
    instanceType: 'm6i.2xlarge',
    ip: `10.0.1.${21 + index}`,
    machine: `${workerSetName(cluster, zone)}-${['b8v2r', 'k4n7q', 'p2d9w'][index] ?? ''}`,
    machineSet: workerSetName(cluster, zone),
  }));
  return [...controlPlane, ...workers];
}

function nodeConditions(ready: boolean): NodeCondition[] {
  const since = minutesBefore(30 * DAY_MINUTES);
  const heartbeat = minutesBefore(1);
  const pressure = (type: string, reason: string, message: string): NodeCondition => ({
    type,
    status: 'False',
    reason,
    message,
    lastHeartbeatTime: heartbeat,
    lastTransitionTime: since,
  });
  return [
    pressure('MemoryPressure', 'KubeletHasSufficientMemory', 'kubelet has sufficient memory available'),
    pressure('DiskPressure', 'KubeletHasNoDiskPressure', 'kubelet has no disk pressure'),
    pressure('PIDPressure', 'KubeletHasSufficientPID', 'kubelet has sufficient PID available'),
    {
      type: 'Ready',
      status: ready ? 'True' : 'False',
      reason: ready ? 'KubeletReady' : 'KubeletNotReady',
      message: ready
        ? 'kubelet is posting ready status'
        : 'container runtime network not ready: NetworkReady=false reason:NetworkPluginNotReady message:Network ' +
          'plugin returns error: no CNI configuration file in /etc/kubernetes/cni/net.d/. Has your network provider started?',
      lastHeartbeatTime: heartbeat,
      lastTransitionTime: ready ? since : minutesBefore(40),
    },
  ];
}

function nodeObject(cluster: string, plan: NodePlan, uid: string, openShift: boolean): Node {
  const ready = !NOT_READY.has(`${cluster}/${plan.name}`);
  const cordoned = CORDONED.has(`${cluster}/${plan.name}`);
  const roleLabels: Record<string, string> =
    plan.role === 'master'
      ? {
          'node-role.kubernetes.io/control-plane': '',
          ...(openShift ? { 'node-role.kubernetes.io/master': '' } : {}),
        }
      : { 'node-role.kubernetes.io/worker': '' };
  const taints: Taint[] = [
    ...(plan.role === 'master'
      ? [
          {
            key: openShift ? 'node-role.kubernetes.io/master' : 'node-role.kubernetes.io/control-plane',
            effect: 'NoSchedule',
          },
        ]
      : []),
    ...(ready
      ? []
      : [{ key: 'node.kubernetes.io/not-ready', effect: 'NoSchedule', timeAdded: minutesBefore(40) }]),
    ...(cordoned
      ? [{ key: 'node.kubernetes.io/unschedulable', effect: 'NoSchedule', timeAdded: minutesBefore(15) }]
      : []),
  ];
  const cpu = plan.role === 'master' ? '4' : '8';
  const memoryKi = plan.role === 'master' ? '16101264Ki' : '32499980Ki';
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: plan.name,
      uid,
      creationTimestamp: minutesBefore((plan.role === 'master' ? 90 : 60) * DAY_MINUTES),
      labels: {
        ...roleLabels,
        'beta.kubernetes.io/arch': 'amd64',
        'kubernetes.io/arch': 'amd64',
        'kubernetes.io/os': 'linux',
        'kubernetes.io/hostname': plan.name,
        'node.kubernetes.io/instance-type': plan.instanceType,
        'topology.kubernetes.io/region': REGION,
        'topology.kubernetes.io/zone': plan.zone,
      },
      ...(openShift
        ? { annotations: { 'machine.openshift.io/machine': `${MACHINE_API_NAMESPACE}/${plan.machine}` } }
        : {}),
    },
    spec: {
      providerID: `aws:///${plan.zone}/i-0${uid.slice(-12)}`,
      ...(cordoned ? { unschedulable: true } : {}),
      ...(taints.length > 0 ? { taints } : {}),
    },
    status: {
      capacity: { cpu, memory: memoryKi, pods: '250', 'ephemeral-storage': '125293548Ki' },
      allocatable: {
        cpu: plan.role === 'master' ? '3500m' : '7500m',
        memory: plan.role === 'master' ? '14950288Ki' : '31349004Ki',
        pods: '250',
        'ephemeral-storage': '114396791822',
      },
      addresses: [
        { type: 'InternalIP', address: plan.ip },
        { type: 'Hostname', address: plan.name },
        { type: 'InternalDNS', address: `ip-${plan.ip.replaceAll('.', '-')}.ec2.internal` },
      ],
      conditions: nodeConditions(ready),
      nodeInfo: {
        architecture: 'amd64',
        bootID: `${uid}-boot`,
        containerRuntimeVersion: 'cri-o://1.30.4',
        kernelVersion: '5.14.0-427.40.1.el9_4.x86_64',
        kubeProxyVersion: KUBELET_VERSION,
        kubeletVersion: KUBELET_VERSION,
        machineID: uid.replaceAll('-', ''),
        operatingSystem: 'linux',
        osImage: 'Linux CoreOS 418.94',
        systemUUID: uid,
      },
    },
  };
}

/** A one-container running pod on `nodeName`. */
function nodePod(
  namespace: string,
  name: string,
  uid: string,
  nodeName: string,
  labels: Record<string, string>,
  image: string,
  owner?: OwnerReference[],
): Pod {
  const container = name.split('-')[0] ?? 'main';
  const status: PodStatus = runningPodStatus(0, 600);
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace,
      uid,
      creationTimestamp: minutesBefore(600),
      labels,
      ...(owner ? { ownerReferences: owner } : {}),
    },
    spec: {
      nodeName,
      restartPolicy: 'Always',
      serviceAccountName: 'default',
      containers: [{ name: container, image }],
    },
    status: {
      ...status,
      containerStatuses: status.containerStatuses?.map((c) => ({ ...c, name: container, image })),
    },
  };
}

/**
 * Per worker: a `node-exporter` DaemonSet pod and a `metrics-proxy` ReplicaSet pod in `openshift-monitoring`, and a
 * bare `node-debug-<node>` pod in `kube-system`, with their DaemonSet and ReplicaSet.
 */
function workerPods(workers: readonly NodePlan[], nextUid: () => string): K8sResource[] {
  const dsUid = nextUid();
  const rsUid = nextUid();
  const dsLabels = { app: 'node-exporter' };
  const rsLabels = { app: 'metrics-proxy', 'pod-template-hash': '5c9f7d8b4' };
  const replicas = workers.length;
  const daemonSet: DaemonSet = {
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: {
      name: 'node-exporter',
      namespace: NODE_POD_NAMESPACE,
      uid: dsUid,
      creationTimestamp: minutesBefore(60 * DAY_MINUTES),
      labels: dsLabels,
    },
    spec: {
      selector: { matchLabels: dsLabels },
      template: {
        metadata: { labels: dsLabels },
        spec: { containers: [{ name: 'node', image: 'quay.io/example/node-exporter:1.8.2' }] },
      },
    },
    status: {
      desiredNumberScheduled: replicas,
      currentNumberScheduled: replicas,
      numberReady: replicas,
      numberAvailable: replicas,
      updatedNumberScheduled: replicas,
      numberMisscheduled: 0,
      observedGeneration: 1,
    },
  };
  const replicaSet: ReplicaSet = {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      name: 'metrics-proxy-5c9f7d8b4',
      namespace: NODE_POD_NAMESPACE,
      uid: rsUid,
      creationTimestamp: minutesBefore(60 * DAY_MINUTES),
      labels: rsLabels,
    },
    spec: {
      replicas,
      selector: { matchLabels: rsLabels },
      template: {
        metadata: { labels: rsLabels },
        spec: { containers: [{ name: 'metrics', image: 'quay.io/example/metrics-proxy:0.4.1' }] },
      },
    },
    status: {
      replicas,
      readyReplicas: replicas,
      availableReplicas: replicas,
      fullyLabeledReplicas: replicas,
      observedGeneration: 1,
    },
  };
  const suffixes = ['4kq8z', 'm2x7p', 't9w3d'];
  const pods = workers.flatMap((worker, index) => {
    const suffix = suffixes[index] ?? `${index}`;
    return [
      nodePod(
        NODE_POD_NAMESPACE,
        `node-exporter-${suffix}`,
        nextUid(),
        worker.name,
        dsLabels,
        'quay.io/example/node-exporter:1.8.2',
        ownedBy('apps/v1', 'DaemonSet', 'node-exporter', dsUid),
      ),
      nodePod(
        NODE_POD_NAMESPACE,
        `metrics-proxy-5c9f7d8b4-${suffix}`,
        nextUid(),
        worker.name,
        rsLabels,
        'quay.io/example/metrics-proxy:0.4.1',
        ownedBy('apps/v1', 'ReplicaSet', 'metrics-proxy-5c9f7d8b4', rsUid),
      ),
      nodePod(
        BARE_POD_NAMESPACE,
        `node-debug-${worker.name}`,
        nextUid(),
        worker.name,
        { app: 'node-debug' },
        'quay.io/example/toolbox:1.0',
      ),
    ];
  });
  return [daemonSet, replicaSet, ...pods] as K8sResource[];
}

/** Provider spec of an AWS machine (instance type and placement, as OCP's Machine pages read it). */
function providerSpec(plan: Pick<NodePlan, 'instanceType' | 'zone'>) {
  return {
    value: { instanceType: plan.instanceType, placement: { availabilityZone: plan.zone, region: REGION } },
  };
}

function machineLabels(cluster: string, plan: NodePlan): Record<string, string> {
  return {
    'machine.openshift.io/cluster-api-cluster': infrastructureName(cluster),
    'machine.openshift.io/cluster-api-machine-role': plan.role,
    'machine.openshift.io/cluster-api-machine-type': plan.role,
    'machine.openshift.io/instance-type': plan.instanceType,
    'machine.openshift.io/region': REGION,
    'machine.openshift.io/zone': plan.zone,
    ...(plan.machineSet ? { 'machine.openshift.io/cluster-api-machineset': plan.machineSet } : {}),
  };
}

/** The two worker MachineSets (zone a: 2 replicas, zone b: 1) and one Machine per node, linked to it by `nodeRef`. */
function machineObjects(
  cluster: string,
  plans: readonly NodePlan[],
  nodeUids: ReadonlyMap<string, string>,
  nextUid: () => string,
): K8sResource[] {
  const setUids = new Map<string, string>();
  const sets: MachineSet[] = [];
  for (const plan of plans) {
    if (!plan.machineSet || setUids.has(plan.machineSet)) continue;
    const uid = nextUid();
    setUids.set(plan.machineSet, uid);
    const members = plans.filter((other) => other.machineSet === plan.machineSet);
    const ready = members.filter((member) => !NOT_READY.has(`${cluster}/${member.name}`)).length;
    const selector = {
      'machine.openshift.io/cluster-api-cluster': infrastructureName(cluster),
      'machine.openshift.io/cluster-api-machineset': plan.machineSet,
    };
    sets.push({
      apiVersion: 'machine.openshift.io/v1beta1',
      kind: 'MachineSet',
      metadata: {
        name: plan.machineSet,
        namespace: MACHINE_API_NAMESPACE,
        uid,
        creationTimestamp: minutesBefore(60 * DAY_MINUTES),
        labels: { 'machine.openshift.io/cluster-api-cluster': infrastructureName(cluster) },
        annotations: {
          'machine.openshift.io/vCPU': '8',
          'machine.openshift.io/memoryMb': '32768',
          'machine.openshift.io/GPU': '0',
        },
      },
      spec: {
        replicas: members.length,
        selector: { matchLabels: selector },
        template: {
          metadata: { labels: machineLabels(cluster, plan) },
          spec: { providerSpec: providerSpec(plan) },
        },
      },
      status: {
        replicas: members.length,
        readyReplicas: ready,
        availableReplicas: ready,
        fullyLabeledReplicas: members.length,
      },
    });
  }
  const machines = plans.map((plan): Machine => {
    const nodeUid = nodeUids.get(plan.name) ?? '';
    const setUid = plan.machineSet ? setUids.get(plan.machineSet) : undefined;
    return {
      apiVersion: 'machine.openshift.io/v1beta1',
      kind: 'Machine',
      metadata: {
        name: plan.machine,
        namespace: MACHINE_API_NAMESPACE,
        uid: nextUid(),
        creationTimestamp: minutesBefore((plan.role === 'master' ? 90 : 60) * DAY_MINUTES),
        labels: machineLabels(cluster, plan),
        annotations: { 'machine.openshift.io/instance-state': 'running' },
        ...(plan.machineSet && setUid
          ? {
              ownerReferences: ownedBy('machine.openshift.io/v1beta1', 'MachineSet', plan.machineSet, setUid),
            }
          : {}),
      },
      spec: { providerSpec: providerSpec(plan), providerID: `aws:///${plan.zone}/i-0${nodeUid.slice(-12)}` },
      status: {
        phase: 'Running',
        addresses: [
          { type: 'InternalIP', address: plan.ip },
          { type: 'InternalDNS', address: `ip-${plan.ip.replaceAll('.', '-')}.ec2.internal` },
        ],
        lastUpdated: minutesBefore(30),
        nodeRef: { kind: 'Node', name: plan.name, uid: nodeUid },
        providerStatus: {
          conditions: [
            {
              type: 'MachineCreation',
              status: 'True',
              reason: 'MachineCreationSucceeded',
              message: 'Machine successfully created',
            },
          ],
        },
      },
    };
  });
  return [...sets, ...machines] as K8sResource[];
}

/**
 * The compute objects of `cluster`: Nodes, the pods on the workers, and the Machine API objects where the cluster
 * serves `machine.openshift.io` (`openShift`). Seeded after everything else so existing uids stay put.
 */
export function computeObjects(cluster: string, nextUid: () => string, openShift: boolean): K8sResource[] {
  const plans = nodePlans(cluster);
  const nodeUids = new Map(plans.map((plan) => [plan.name, nextUid()]));
  const nodes = plans.map((plan) => nodeObject(cluster, plan, nodeUids.get(plan.name) ?? '', openShift));
  const pods = workerPods(
    plans.filter((plan) => plan.role === 'worker'),
    nextUid,
  );
  return [
    ...(nodes as K8sResource[]),
    ...pods,
    ...(openShift ? machineObjects(cluster, plans, nodeUids, nextUid) : []),
  ];
}
