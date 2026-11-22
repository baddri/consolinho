import type { PodStatus } from 'kubernetes-types/core/v1';
import type {
  ConfigMap,
  Deployment,
  Event,
  K8sResource,
  Namespace,
  Pod,
  Project,
  ReplicaSet,
  Service,
} from '@/shared/k8s';
import { fingerprintOf } from '../fixtures/ids';
import { FIXTURE_NOW } from '../fixtures/time';

/**
 * Seeded Kubernetes fixtures (T-0070). Every cluster gets the same shape — same namespaces, names and labels, so the
 * "keep context on switch" comparison (SW-9) lands on an existing object — with small per-cluster differences (image
 * tag, a config value, restart counts) derived from the cluster name. uids and timestamps are deterministic.
 */

/** Clusters that are vanilla Kubernetes: no `project.openshift.io` group in discovery. */
export const VANILLA_CLUSTERS: ReadonlySet<string> = new Set(['lab-1']);

/** Whether `cluster` serves OpenShift's `project.openshift.io/v1`. */
export function servesProjects(cluster: string): boolean {
  return !VANILLA_CLUSTERS.has(cluster);
}

/** Namespaces (and, where served, projects) on every cluster. */
export const FIXTURE_NAMESPACES = [
  'default',
  'kube-system',
  'openshift-monitoring',
  'payments',
  'shop',
] as const;

/** The `web` pods in `shop`; the last one is in CrashLoopBackOff. */
export const WEB_POD_NAMES = [
  'web-7d4b9c8f6d-2xkqp',
  'web-7d4b9c8f6d-8mzrt',
  'web-7d4b9c8f6d-tq5wn',
] as const;

const WEB_REPLICASET = 'web-7d4b9c8f6d';
const MINUTE_MS = 60_000;

/** RFC 3339 timestamp without fractional seconds, as the API server writes it. */
export function k8sTime(epochMs: number): string {
  return new Date(epochMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** {@link k8sTime} `minutes` before the fixture reference time. */
function minutesBefore(minutes: number): string {
  return k8sTime(FIXTURE_NOW - minutes * MINUTE_MS);
}

/** Small deterministic number derived from the cluster name, for per-cluster differences. */
function clusterSeed(cluster: string): number {
  return Number.parseInt(fingerprintOf(cluster).slice(0, 4), 16);
}

/**
 * Deterministic uid generator for one cluster: `<cluster fingerprint>-0000-4000-8000-<n>`, so uids differ between
 * clusters (as they would) but not between runs.
 */
export function uidFactory(cluster: string): () => string {
  const prefix = fingerprintOf(cluster);
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
  };
}

/** A pod's status while its `web` container runs. */
export function runningPodStatus(restartCount: number, startedMinutesAgo: number): PodStatus {
  const startedAt = minutesBefore(startedMinutesAgo);
  return {
    phase: 'Running',
    hostIP: '10.0.1.21',
    podIP: '10.128.2.14',
    startTime: startedAt,
    conditions: [
      { type: 'Initialized', status: 'True', lastTransitionTime: startedAt },
      { type: 'Ready', status: 'True', lastTransitionTime: startedAt },
      { type: 'ContainersReady', status: 'True', lastTransitionTime: startedAt },
      { type: 'PodScheduled', status: 'True', lastTransitionTime: startedAt },
    ],
    containerStatuses: [
      {
        name: 'web',
        image: 'quay.io/example/web:1.4.2',
        imageID: 'quay.io/example/web@sha256:3f1c0d7e',
        ready: true,
        started: true,
        restartCount,
        state: { running: { startedAt } },
      },
    ],
  };
}

/** A pod's status while its `web` container crash-loops (last exit code 1). */
export function crashLoopPodStatus(podName: string, restartCount: number): PodStatus {
  const finishedAt = minutesBefore(2);
  return {
    phase: 'Running',
    hostIP: '10.0.1.22',
    podIP: '10.128.3.7',
    startTime: minutesBefore(180),
    conditions: [
      { type: 'Initialized', status: 'True', lastTransitionTime: minutesBefore(180) },
      {
        type: 'Ready',
        status: 'False',
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [web]',
        lastTransitionTime: finishedAt,
      },
      {
        type: 'ContainersReady',
        status: 'False',
        reason: 'ContainersNotReady',
        lastTransitionTime: finishedAt,
      },
      { type: 'PodScheduled', status: 'True', lastTransitionTime: minutesBefore(180) },
    ],
    containerStatuses: [
      {
        name: 'web',
        image: 'quay.io/example/web:1.4.2',
        imageID: 'quay.io/example/web@sha256:3f1c0d7e',
        ready: false,
        started: false,
        restartCount,
        state: {
          waiting: {
            reason: 'CrashLoopBackOff',
            message: `back-off 5m0s restarting failed container=web pod=${podName}_shop(${podName})`,
          },
        },
        lastState: {
          terminated: {
            exitCode: 1,
            reason: 'Error',
            startedAt: minutesBefore(3),
            finishedAt,
          },
        },
      },
    ],
  };
}

/** A pod of the `web` deployment (or any `app` label) in `namespace`. */
export function podObject(
  namespace: string,
  name: string,
  uid: string,
  app: string,
  image: string,
  status: PodStatus,
  ownerUid?: string,
): Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace,
      uid,
      creationTimestamp: minutesBefore(180),
      labels: { app, 'pod-template-hash': WEB_REPLICASET.slice(4) },
      ...(ownerUid === undefined
        ? {}
        : {
            ownerReferences: [
              {
                apiVersion: 'apps/v1',
                kind: 'ReplicaSet',
                name: WEB_REPLICASET,
                uid: ownerUid,
                controller: true,
                blockOwnerDeletion: true,
              },
            ],
          }),
    },
    spec: {
      nodeName: 'worker-1',
      restartPolicy: 'Always',
      serviceAccountName: 'default',
      containers: [{ name: 'web', image, ports: [{ containerPort: 8080, protocol: 'TCP' }] }],
    },
    status: { ...status, containerStatuses: status.containerStatuses?.map((c) => ({ ...c, image })) },
  };
}

/** A core/v1 Event about `pod`. */
export function podEvent(
  pod: Pod,
  uid: string | undefined,
  suffix: string,
  type: 'Normal' | 'Warning',
  reason: string,
  message: string,
  count: number,
  at: string,
): Event {
  const podName = pod.metadata?.name ?? '';
  return {
    apiVersion: 'v1',
    kind: 'Event',
    metadata: {
      name: `${podName}.${suffix}`,
      namespace: pod.metadata?.namespace,
      uid,
      creationTimestamp: at,
    },
    involvedObject: {
      apiVersion: 'v1',
      kind: 'Pod',
      name: podName,
      namespace: pod.metadata?.namespace,
      uid: pod.metadata?.uid,
      fieldPath: 'spec.containers{web}',
    },
    type,
    reason,
    message,
    count,
    firstTimestamp: at,
    lastTimestamp: at,
    source: { component: 'kubelet', host: 'worker-1' },
    reportingComponent: 'kubelet',
    reportingInstance: 'worker-1',
  };
}

function namespaceObject(name: string, uid: string): Namespace {
  return {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name,
      uid,
      creationTimestamp: minutesBefore(60 * 24 * 90),
      labels: { 'kubernetes.io/metadata.name': name },
    },
    spec: { finalizers: ['kubernetes'] },
    status: { phase: 'Active' },
  };
}

function projectObject(namespace: Namespace): Project {
  const name = namespace.metadata?.name ?? '';
  const annotations: Record<string, string> =
    name === 'shop'
      ? {
          'openshift.io/display-name': 'Web shop',
          'openshift.io/description': 'Storefront and its configuration.',
          'openshift.io/requester': 'carol',
        }
      : name === 'payments'
        ? { 'openshift.io/display-name': 'Payments', 'openshift.io/requester': 'alice' }
        : {};
  return {
    apiVersion: 'project.openshift.io/v1',
    kind: 'Project',
    // A project is a view of its namespace: same name and uid.
    metadata: { ...namespace.metadata, annotations },
    spec: { finalizers: ['kubernetes'] },
    status: { phase: 'Active' },
  };
}

/** The objects of the `shop` application: deployment, pods, service, config maps and events. */
function shopObjects(cluster: string, nextUid: () => string): K8sResource[] {
  const seed = clusterSeed(cluster);
  const tag = cluster.startsWith('dev') || cluster.startsWith('lab') ? '1.5.0-rc.1' : '1.4.2';
  const image = `quay.io/example/web:${tag}`;
  const deploymentUid = nextUid();
  const replicaSetUid = nextUid();

  const deployment: Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'web',
      namespace: 'shop',
      uid: deploymentUid,
      generation: 4,
      creationTimestamp: minutesBefore(60 * 24 * 30),
      labels: { app: 'web' },
      annotations: { 'deployment.kubernetes.io/revision': '4' },
    },
    spec: {
      replicas: 3,
      selector: { matchLabels: { app: 'web' } },
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' } },
      template: {
        metadata: { labels: { app: 'web' } },
        spec: {
          containers: [
            {
              name: 'web',
              image,
              ports: [{ containerPort: 8080, protocol: 'TCP' }],
              resources: { limits: { cpu: '500m', memory: '256Mi' } },
              volumeMounts: [{ name: 'config', mountPath: '/etc/web', readOnly: true }],
            },
          ],
          volumes: [{ name: 'config', configMap: { name: 'web-config' } }],
        },
      },
    },
    status: {
      observedGeneration: 4,
      replicas: 3,
      updatedReplicas: 3,
      readyReplicas: 2,
      availableReplicas: 2,
      unavailableReplicas: 1,
      conditions: [
        {
          type: 'Available',
          status: 'True',
          reason: 'MinimumReplicasAvailable',
          message: 'Deployment has minimum availability.',
          lastTransitionTime: minutesBefore(170),
          lastUpdateTime: minutesBefore(170),
        },
        {
          type: 'Progressing',
          status: 'True',
          reason: 'NewReplicaSetAvailable',
          message: `ReplicaSet "${WEB_REPLICASET}" has successfully progressed.`,
          lastTransitionTime: minutesBefore(175),
          lastUpdateTime: minutesBefore(170),
        },
      ],
    },
  };

  const crashRestarts = 5 + (seed % 7);
  const pods = WEB_POD_NAMES.map((name, index) =>
    podObject(
      'shop',
      name,
      nextUid(),
      'web',
      image,
      index === WEB_POD_NAMES.length - 1
        ? crashLoopPodStatus(name, crashRestarts)
        : runningPodStatus(index, 170 - index * 10),
      replicaSetUid,
    ),
  );

  const service: Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'web',
      namespace: 'shop',
      uid: nextUid(),
      creationTimestamp: minutesBefore(60 * 24 * 30),
      labels: { app: 'web' },
    },
    spec: {
      type: 'ClusterIP',
      selector: { app: 'web' },
      clusterIP: `172.30.${seed % 250}.17`,
      clusterIPs: [`172.30.${seed % 250}.17`],
      ports: [{ name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }],
      sessionAffinity: 'None',
    },
    status: { loadBalancer: {} },
  };

  const webConfig: ConfigMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'web-config',
      namespace: 'shop',
      uid: nextUid(),
      creationTimestamp: minutesBefore(60 * 24 * 30),
      labels: { app: 'web' },
    },
    data: {
      LOG_LEVEL: cluster.startsWith('prod') ? 'info' : 'debug',
      'app.properties': `shop.currency=EUR\nshop.cluster=${cluster}\n`,
    },
  };

  const webAssets: ConfigMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'web-assets',
      namespace: 'shop',
      uid: nextUid(),
      creationTimestamp: minutesBefore(60 * 24 * 30),
      labels: { app: 'web' },
    },
    data: { 'README.txt': 'Binary assets of the web shop.\n' },
    // 1x1 transparent PNG.
    binaryData: {
      'favicon.png':
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    },
  };

  const crashing = pods[pods.length - 1];
  const events: Event[] = pods.map((pod, index) =>
    podEvent(
      pod,
      nextUid(),
      `17a3f${index}c0d1e2f3a4`,
      'Normal',
      'Started',
      'Started container web',
      1,
      minutesBefore(170 - index * 10),
    ),
  );
  if (crashing) {
    events.push(
      podEvent(
        crashing,
        nextUid(),
        '17a3f9e8d7c6b5a4',
        'Warning',
        'BackOff',
        'Back-off restarting failed container web in pod ' + (crashing.metadata?.name ?? ''),
        crashRestarts * 4,
        minutesBefore(2),
      ),
    );
  }

  const replicaSet: ReplicaSet = {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      name: WEB_REPLICASET,
      namespace: 'shop',
      uid: replicaSetUid,
      creationTimestamp: minutesBefore(180),
      labels: { app: 'web', 'pod-template-hash': WEB_REPLICASET.slice(4) },
      annotations: { 'deployment.kubernetes.io/revision': '4' },
      ownerReferences: [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'web',
          uid: deploymentUid,
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
    },
    spec: {
      replicas: 3,
      selector: { matchLabels: { app: 'web', 'pod-template-hash': WEB_REPLICASET.slice(4) } },
      template: {
        metadata: { labels: { app: 'web', 'pod-template-hash': WEB_REPLICASET.slice(4) } },
        spec: deployment.spec?.template.spec,
      },
    },
    status: {
      replicas: 3,
      readyReplicas: 2,
      availableReplicas: 2,
      fullyLabeledReplicas: 3,
      observedGeneration: 4,
    },
  };

  return [deployment, replicaSet, ...pods, service, webConfig, webAssets, ...events] as K8sResource[];
}

/** The `payments` namespace holds just a config map, so it is not empty. */
function paymentsObjects(cluster: string, nextUid: () => string): K8sResource[] {
  const config: ConfigMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'payments-config',
      namespace: 'payments',
      uid: nextUid(),
      creationTimestamp: minutesBefore(60 * 24 * 20),
      labels: { app: 'payments', tier: 'backend' },
    },
    data: { PROVIDER: cluster.startsWith('prod') ? 'live' : 'sandbox' },
  };
  return [config as K8sResource];
}

/**
 * Builds the seed objects of `cluster`, without `resourceVersion` (the store assigns them). Objects carry
 * `apiVersion` and `kind`; the store resolves their model from those.
 */
export function seedClusterObjects(cluster: string): K8sResource[] {
  const nextUid = uidFactory(cluster);
  const namespaces = FIXTURE_NAMESPACES.map((name) => namespaceObject(name, nextUid()));
  const projects = servesProjects(cluster) ? namespaces.map(projectObject) : [];
  return [
    ...(namespaces as K8sResource[]),
    ...projects,
    ...shopObjects(cluster, nextUid),
    ...paymentsObjects(cluster, nextUid),
  ];
}
