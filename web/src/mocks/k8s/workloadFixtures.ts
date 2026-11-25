import type { PodStatus } from 'kubernetes-types/core/v1';
import type {
  CronJob,
  DaemonSet,
  Deployment,
  DeploymentConfig,
  HorizontalPodAutoscaler,
  Job,
  K8sResource,
  OwnerReference,
  Pod,
  ReplicaSet,
  ReplicationController,
  Secret,
  StatefulSet,
} from '@/shared/k8s';
import { FIXTURE_NOW } from '../fixtures/time';
import { k8sTime, runningPodStatus } from './fixtures';

/**
 * CP4b workload fixtures in `shop` (T-0189): one object graph per new kind — StatefulSet, DaemonSet, standalone
 * ReplicaSet and ReplicationController, DeploymentConfig with its ReplicationControllers (OpenShift clusters only),
 * CronJob with Jobs, a standalone Job, an HPA-scaled Deployment and two Secrets — each with the pods it owns, so lists,
 * owner links, Pods tabs and rings have data. Same shape on every cluster except the DC graph (SW-9 keeps context).
 */

const NAMESPACE = 'shop';
const MINUTE_MS = 60_000;
const DAY_MINUTES = 60 * 24;

function minutesBefore(minutes: number): string {
  return k8sTime(FIXTURE_NOW - minutes * MINUTE_MS);
}

/** A controller owner reference, as the controllers write it. */
function ownedBy(apiVersion: string, kind: string, name: string, uid: string): OwnerReference[] {
  return [{ apiVersion, kind, name, uid, controller: true, blockOwnerDeletion: true }];
}

/** Status of a pod whose one container ran to completion (Job pods). */
function completedPodStatus(startedMinutesAgo: number): PodStatus {
  const startedAt = minutesBefore(startedMinutesAgo);
  const finishedAt = minutesBefore(startedMinutesAgo - 2);
  return {
    phase: 'Succeeded',
    hostIP: '10.0.1.21',
    podIP: '10.128.2.40',
    startTime: startedAt,
    conditions: [
      { type: 'Initialized', status: 'True', lastTransitionTime: startedAt, reason: 'PodCompleted' },
      { type: 'Ready', status: 'False', lastTransitionTime: finishedAt, reason: 'PodCompleted' },
      { type: 'ContainersReady', status: 'False', lastTransitionTime: finishedAt, reason: 'PodCompleted' },
      { type: 'PodScheduled', status: 'True', lastTransitionTime: startedAt },
    ],
    containerStatuses: [
      {
        name: 'main',
        image: '',
        imageID: '',
        ready: false,
        started: false,
        restartCount: 0,
        state: { terminated: { exitCode: 0, reason: 'Completed', startedAt, finishedAt } },
      },
    ],
  };
}

interface PodSpecInput {
  name: string;
  uid: string;
  labels: Record<string, string>;
  owner?: OwnerReference[];
  container: string;
  image: string;
  status: PodStatus;
  nodeName?: string;
  restartPolicy?: 'Always' | 'OnFailure' | 'Never';
  /** PVCs the pod mounts, by claim name (volume name = claim name). */
  claims?: string[];
  createdMinutesAgo: number;
}

/** A pod with one container; its container status takes the container's name and image. */
function pod(input: PodSpecInput): Pod {
  return {
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: {
      name: input.name,
      namespace: NAMESPACE,
      uid: input.uid,
      creationTimestamp: minutesBefore(input.createdMinutesAgo),
      labels: input.labels,
      ...(input.owner ? { ownerReferences: input.owner } : {}),
    },
    spec: {
      nodeName: input.nodeName ?? 'worker-1',
      restartPolicy: input.restartPolicy ?? 'Always',
      serviceAccountName: 'default',
      containers: [{ name: input.container, image: input.image }],
      ...(input.claims
        ? { volumes: input.claims.map((claimName) => ({ name: claimName, persistentVolumeClaim: { claimName } })) }
        : {}),
    },
    status: {
      ...input.status,
      containerStatuses: input.status.containerStatuses?.map((c) => ({
        ...c,
        name: input.container,
        image: input.image,
      })),
    },
  };
}

/** Pod template of a one-container workload. */
function template(labels: Record<string, string>, container: string, image: string) {
  return { metadata: { labels }, spec: { containers: [{ name: container, image }] } };
}

/** StatefulSet `db` (3/3) and its pods `db-0..2`. */
function statefulSetObjects(nextUid: () => string): K8sResource[] {
  const uid = nextUid();
  const image = 'quay.io/example/postgres:16';
  const labels = { app: 'db' };
  const statefulSet: StatefulSet = {
    kind: 'StatefulSet',
    apiVersion: 'apps/v1',
    metadata: {
      name: 'db',
      namespace: NAMESPACE,
      uid,
      creationTimestamp: minutesBefore(20 * DAY_MINUTES),
      labels,
    },
    spec: {
      replicas: 3,
      serviceName: 'db',
      selector: { matchLabels: labels },
      template: template(labels, 'postgres', image),
      updateStrategy: { type: 'RollingUpdate', rollingUpdate: { partition: 0 } },
      podManagementPolicy: 'OrderedReady',
    },
    status: {
      observedGeneration: 1,
      replicas: 3,
      readyReplicas: 3,
      currentReplicas: 3,
      updatedReplicas: 3,
      availableReplicas: 3,
      currentRevision: 'db-5c8f7b9d4',
      updateRevision: 'db-5c8f7b9d4',
    },
  };
  const pods = [0, 1, 2].map((index) =>
    pod({
      name: `db-${index}`,
      uid: nextUid(),
      labels: { ...labels, 'statefulset.kubernetes.io/pod-name': `db-${index}` },
      owner: ownedBy('apps/v1', 'StatefulSet', 'db', uid),
      container: 'postgres',
      image,
      claims: ['db-data'],
      status: runningPodStatus(0, 600 - index * 5),
      createdMinutesAgo: 600 - index * 5,
    }),
  );
  return [statefulSet, ...pods] as K8sResource[];
}

/** DaemonSet `node-agent` (2 desired / 2 current), one pod per worker node. */
function daemonSetObjects(nextUid: () => string): K8sResource[] {
  const uid = nextUid();
  const image = 'quay.io/example/node-agent:2.1.0';
  const labels = { app: 'node-agent' };
  const daemonSet: DaemonSet = {
    kind: 'DaemonSet',
    apiVersion: 'apps/v1',
    metadata: {
      name: 'node-agent',
      namespace: NAMESPACE,
      uid,
      creationTimestamp: minutesBefore(25 * DAY_MINUTES),
      labels,
    },
    spec: {
      selector: { matchLabels: labels },
      template: template(labels, 'agent', image),
      updateStrategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 1 } },
    },
    status: {
      desiredNumberScheduled: 2,
      currentNumberScheduled: 2,
      numberReady: 2,
      numberAvailable: 2,
      updatedNumberScheduled: 2,
      numberMisscheduled: 0,
      observedGeneration: 1,
    },
  };
  const pods = ['worker-1', 'worker-2'].map((node, index) =>
    pod({
      name: `node-agent-${index === 0 ? 'h7x2k' : 'q9m4t'}`,
      uid: nextUid(),
      labels,
      owner: ownedBy('apps/v1', 'DaemonSet', 'node-agent', uid),
      container: 'agent',
      image,
      status: runningPodStatus(0, 900),
      nodeName: node,
      createdMinutesAgo: 900,
    }),
  );
  return [daemonSet, ...pods] as K8sResource[];
}

/** Standalone ReplicaSet `legacy-rs` and ReplicationController `legacy-rc` (no owner, 1 replica, 1 pod each). */
function standaloneControllerObjects(nextUid: () => string): K8sResource[] {
  const rsUid = nextUid();
  const rcUid = nextUid();
  const image = 'quay.io/example/legacy:0.9';
  const rsLabels = { app: 'legacy-rs' };
  const rcLabels = { app: 'legacy-rc' };
  const replicaSet: ReplicaSet = {
    kind: 'ReplicaSet',
    apiVersion: 'apps/v1',
    metadata: {
      name: 'legacy-rs',
      namespace: NAMESPACE,
      uid: rsUid,
      creationTimestamp: minutesBefore(40 * DAY_MINUTES),
      labels: rsLabels,
    },
    spec: { replicas: 1, selector: { matchLabels: rsLabels }, template: template(rsLabels, 'legacy', image) },
    status: {
      replicas: 1,
      readyReplicas: 1,
      availableReplicas: 1,
      fullyLabeledReplicas: 1,
      observedGeneration: 1,
    },
  };
  const replicationController: ReplicationController = {
    kind: 'ReplicationController',
    apiVersion: 'v1',
    metadata: {
      name: 'legacy-rc',
      namespace: NAMESPACE,
      uid: rcUid,
      creationTimestamp: minutesBefore(45 * DAY_MINUTES),
      labels: rcLabels,
    },
    spec: { replicas: 1, selector: rcLabels, template: template(rcLabels, 'legacy', image) },
    status: {
      replicas: 1,
      readyReplicas: 1,
      availableReplicas: 1,
      fullyLabeledReplicas: 1,
      observedGeneration: 1,
    },
  };
  const pods = [
    pod({
      name: 'legacy-rs-5kq8d',
      uid: nextUid(),
      labels: rsLabels,
      owner: ownedBy('apps/v1', 'ReplicaSet', 'legacy-rs', rsUid),
      container: 'legacy',
      image,
      status: runningPodStatus(1, 2000),
      createdMinutesAgo: 2000,
    }),
    pod({
      name: 'legacy-rc-w2v6n',
      uid: nextUid(),
      labels: rcLabels,
      owner: ownedBy('v1', 'ReplicationController', 'legacy-rc', rcUid),
      container: 'legacy',
      image,
      status: runningPodStatus(0, 2100),
      createdMinutesAgo: 2100,
    }),
  ];
  return [replicaSet, replicationController, ...pods] as K8sResource[];
}

/** DeploymentConfig `frontend` (latest version 2) with RCs `frontend-1` (scaled down) and `frontend-2` + pods. */
function deploymentConfigObjects(nextUid: () => string): K8sResource[] {
  const uid = nextUid();
  const image = 'quay.io/example/frontend:2.0.0';
  const selector = { app: 'frontend', deploymentconfig: 'frontend' };
  const deploymentConfig: DeploymentConfig = {
    kind: 'DeploymentConfig',
    apiVersion: 'apps.openshift.io/v1',
    metadata: {
      name: 'frontend',
      namespace: NAMESPACE,
      uid,
      generation: 3,
      creationTimestamp: minutesBefore(15 * DAY_MINUTES),
      labels: { app: 'frontend' },
    },
    spec: {
      replicas: 2,
      selector,
      template: template(selector, 'frontend', image),
      strategy: {
        type: 'Rolling',
        rollingParams: {
          maxSurge: '25%',
          maxUnavailable: '25%',
          timeoutSeconds: 600,
          updatePeriodSeconds: 1,
          intervalSeconds: 1,
        },
      },
      triggers: [{ type: 'ConfigChange' }],
    },
    status: {
      latestVersion: 2,
      observedGeneration: 3,
      replicas: 2,
      readyReplicas: 2,
      availableReplicas: 2,
      updatedReplicas: 2,
      unavailableReplicas: 0,
      conditions: [
        {
          type: 'Available',
          status: 'True',
          reason: 'MinimumReplicasAvailable',
          message: 'Deployment config has minimum availability.',
          lastTransitionTime: minutesBefore(3 * DAY_MINUTES),
          lastUpdateTime: minutesBefore(3 * DAY_MINUTES),
        },
        {
          type: 'Progressing',
          status: 'True',
          reason: 'NewReplicationControllerAvailable',
          message: 'replication controller "frontend-2" successfully rolled out',
          lastTransitionTime: minutesBefore(3 * DAY_MINUTES),
          lastUpdateTime: minutesBefore(3 * DAY_MINUTES),
        },
      ],
      details: { message: 'config change' },
    },
  };
  const controllers = [1, 2].map((version): ReplicationController => {
    const name = `frontend-${version}`;
    const replicas = version === 2 ? 2 : 0;
    const labels = { ...selector, deployment: name };
    return {
      kind: 'ReplicationController',
      apiVersion: 'v1',
      metadata: {
        name,
        namespace: NAMESPACE,
        uid: nextUid(),
        creationTimestamp: minutesBefore((version === 2 ? 3 : 15) * DAY_MINUTES),
        labels: { app: 'frontend', 'openshift.io/deployment-config.name': 'frontend' },
        annotations: {
          'openshift.io/deployment-config.name': 'frontend',
          'openshift.io/deployment-config.latest-version': String(version),
          'openshift.io/deployment.phase': 'Complete',
          'openshift.io/deployer-pod.completed-at': minutesBefore((version === 2 ? 3 : 15) * DAY_MINUTES - 2),
        },
        ownerReferences: ownedBy('apps.openshift.io/v1', 'DeploymentConfig', 'frontend', uid),
      },
      spec: { replicas, selector: labels, template: template(labels, 'frontend', image) },
      status: { replicas, readyReplicas: replicas, availableReplicas: replicas, observedGeneration: 2 },
    };
  });
  const current = controllers[1];
  const currentUid = current?.metadata?.uid ?? '';
  const pods = ['frontend-2-7mxkq', 'frontend-2-b4nzp'].map((name, index) =>
    pod({
      name,
      uid: nextUid(),
      labels: { ...selector, deployment: 'frontend-2' },
      owner: ownedBy('v1', 'ReplicationController', 'frontend-2', currentUid),
      container: 'frontend',
      image,
      status: runningPodStatus(0, 3 * DAY_MINUTES - index),
      createdMinutesAgo: 3 * DAY_MINUTES - index,
    }),
  );
  return [deploymentConfig, ...controllers, ...pods] as K8sResource[];
}

/** A completed one-pod Job `name` (with its pod), optionally owned by a CronJob. */
function completedJob(
  nextUid: () => string,
  name: string,
  createdMinutesAgo: number,
  owner?: OwnerReference[],
): K8sResource[] {
  const uid = nextUid();
  const image = 'quay.io/example/batch:1.2.0';
  const labels = { 'batch.kubernetes.io/controller-uid': uid, 'batch.kubernetes.io/job-name': name };
  const job: Job = {
    kind: 'Job',
    apiVersion: 'batch/v1',
    metadata: {
      name,
      namespace: NAMESPACE,
      uid,
      creationTimestamp: minutesBefore(createdMinutesAgo),
      labels,
      ...(owner ? { ownerReferences: owner } : {}),
    },
    spec: {
      completions: 1,
      parallelism: 1,
      backoffLimit: 6,
      selector: { matchLabels: { 'batch.kubernetes.io/controller-uid': uid } },
      template: {
        metadata: { labels },
        spec: { restartPolicy: 'Never', containers: [{ name: 'main', image }] },
      },
    },
    status: {
      startTime: minutesBefore(createdMinutesAgo),
      completionTime: minutesBefore(createdMinutesAgo - 2),
      succeeded: 1,
      conditions: [
        {
          type: 'Complete',
          status: 'True',
          lastProbeTime: minutesBefore(createdMinutesAgo - 2),
          lastTransitionTime: minutesBefore(createdMinutesAgo - 2),
        },
      ],
    },
  };
  const jobPod = pod({
    name: `${name}-x5r7c`,
    uid: nextUid(),
    labels: { ...labels, 'job-name': name },
    owner: ownedBy('batch/v1', 'Job', name, uid),
    container: 'main',
    image,
    status: completedPodStatus(createdMinutesAgo),
    restartPolicy: 'Never',
    createdMinutesAgo,
  });
  return [job, jobPod] as K8sResource[];
}

/** CronJob `nightly-report` (02:00 daily) with its two last Jobs, and the standalone Job `migrate-db`. */
function batchObjects(nextUid: () => string): K8sResource[] {
  const uid = nextUid();
  const image = 'quay.io/example/batch:1.2.0';
  const labels = { app: 'nightly-report' };
  const cronJob: CronJob = {
    kind: 'CronJob',
    apiVersion: 'batch/v1',
    metadata: {
      name: 'nightly-report',
      namespace: NAMESPACE,
      uid,
      creationTimestamp: minutesBefore(30 * DAY_MINUTES),
      labels,
    },
    spec: {
      schedule: '0 2 * * *',
      concurrencyPolicy: 'Forbid',
      suspend: false,
      successfulJobsHistoryLimit: 3,
      failedJobsHistoryLimit: 1,
      jobTemplate: {
        spec: {
          template: {
            metadata: { labels },
            spec: { restartPolicy: 'OnFailure', containers: [{ name: 'main', image }] },
          },
        },
      },
    },
    status: {
      lastScheduleTime: minutesBefore(8 * 60),
      lastSuccessfulTime: minutesBefore(8 * 60 - 2),
    },
  };
  const owner = ownedBy('batch/v1', 'CronJob', 'nightly-report', uid);
  return [
    cronJob as K8sResource,
    ...completedJob(nextUid, 'nightly-report-29100000', DAY_MINUTES + 8 * 60, owner),
    ...completedJob(nextUid, 'nightly-report-29101440', 8 * 60, owner),
    ...completedJob(nextUid, 'migrate-db', 10 * DAY_MINUTES),
  ];
}

/** Deployment `worker` (2 replicas, ReplicaSet and pods) scaled by HPA `worker` (2–5, CPU 80 % / 35 %). */
function autoscaledObjects(nextUid: () => string): K8sResource[] {
  const deploymentUid = nextUid();
  const replicaSetUid = nextUid();
  const image = 'quay.io/example/worker:3.4.1';
  const hash = '6f9c7b5d8';
  const labels = { app: 'worker' };
  const deployment: Deployment = {
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    metadata: {
      name: 'worker',
      namespace: NAMESPACE,
      uid: deploymentUid,
      generation: 1,
      creationTimestamp: minutesBefore(12 * DAY_MINUTES),
      labels,
      annotations: { 'deployment.kubernetes.io/revision': '1' },
    },
    spec: {
      replicas: 2,
      selector: { matchLabels: labels },
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' } },
      template: {
        metadata: { labels },
        spec: { containers: [{ name: 'worker', image, resources: { requests: { cpu: '100m' } } }] },
      },
    },
    status: {
      observedGeneration: 1,
      replicas: 2,
      updatedReplicas: 2,
      readyReplicas: 2,
      availableReplicas: 2,
      conditions: [
        {
          type: 'Available',
          status: 'True',
          reason: 'MinimumReplicasAvailable',
          message: 'Deployment has minimum availability.',
          lastTransitionTime: minutesBefore(12 * DAY_MINUTES),
          lastUpdateTime: minutesBefore(12 * DAY_MINUTES),
        },
      ],
    },
  };
  const rsLabels = { ...labels, 'pod-template-hash': hash };
  const replicaSet: ReplicaSet = {
    kind: 'ReplicaSet',
    apiVersion: 'apps/v1',
    metadata: {
      name: `worker-${hash}`,
      namespace: NAMESPACE,
      uid: replicaSetUid,
      creationTimestamp: minutesBefore(12 * DAY_MINUTES),
      labels: rsLabels,
      annotations: { 'deployment.kubernetes.io/revision': '1' },
      ownerReferences: ownedBy('apps/v1', 'Deployment', 'worker', deploymentUid),
    },
    spec: { replicas: 2, selector: { matchLabels: rsLabels }, template: template(rsLabels, 'worker', image) },
    status: {
      replicas: 2,
      readyReplicas: 2,
      availableReplicas: 2,
      fullyLabeledReplicas: 2,
      observedGeneration: 1,
    },
  };
  const pods = ['k2p9w', 'r8d3s'].map((suffix) =>
    pod({
      name: `worker-${hash}-${suffix}`,
      uid: nextUid(),
      labels: rsLabels,
      owner: ownedBy('apps/v1', 'ReplicaSet', `worker-${hash}`, replicaSetUid),
      container: 'worker',
      image,
      status: runningPodStatus(0, 4000),
      createdMinutesAgo: 4000,
    }),
  );
  const hpa: HorizontalPodAutoscaler = {
    kind: 'HorizontalPodAutoscaler',
    apiVersion: 'autoscaling/v2',
    metadata: {
      name: 'worker',
      namespace: NAMESPACE,
      uid: nextUid(),
      creationTimestamp: minutesBefore(12 * DAY_MINUTES),
      labels,
    },
    spec: {
      scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'worker' },
      minReplicas: 2,
      maxReplicas: 5,
      metrics: [
        {
          type: 'Resource',
          resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } },
        },
      ],
    },
    status: {
      currentReplicas: 2,
      desiredReplicas: 2,
      lastScaleTime: minutesBefore(4000),
      currentMetrics: [
        {
          type: 'Resource',
          resource: { name: 'cpu', current: { averageUtilization: 35, averageValue: '35m' } },
        },
      ],
      conditions: [
        {
          type: 'AbleToScale',
          status: 'True',
          reason: 'ReadyForNewScale',
          message: 'recommended size matches current size',
          lastTransitionTime: minutesBefore(12 * DAY_MINUTES),
        },
        {
          type: 'ScalingActive',
          status: 'True',
          reason: 'ValidMetricFound',
          message: 'the HPA was able to successfully calculate a replica count from cpu resource utilization',
          lastTransitionTime: minutesBefore(12 * DAY_MINUTES),
        },
      ],
    },
  };
  return [deployment, replicaSet, ...pods, hpa] as K8sResource[];
}

/** Secrets `db-credentials` (Opaque) and `registry-pull` (dockerconfigjson); every value is obviously fake. */
function secretObjects(nextUid: () => string): K8sResource[] {
  const dockerConfig = { auths: { 'registry.example.com': { auth: btoa('fake-user:fake-password') } } };
  const secrets: Secret[] = [
    {
      kind: 'Secret',
      apiVersion: 'v1',
      metadata: {
        name: 'db-credentials',
        namespace: NAMESPACE,
        uid: nextUid(),
        creationTimestamp: minutesBefore(20 * DAY_MINUTES),
        labels: { app: 'db' },
      },
      type: 'Opaque',
      data: { username: btoa('shop'), password: btoa('fake-password-not-real') },
    },
    {
      kind: 'Secret',
      apiVersion: 'v1',
      metadata: {
        name: 'registry-pull',
        namespace: NAMESPACE,
        uid: nextUid(),
        creationTimestamp: minutesBefore(30 * DAY_MINUTES),
      },
      type: 'kubernetes.io/dockerconfigjson',
      data: { '.dockerconfigjson': btoa(JSON.stringify(dockerConfig)) },
    },
  ];
  return secrets as K8sResource[];
}

/**
 * The CP4b workload objects of `cluster` in `shop`. DeploymentConfigs and their RCs exist only where the cluster
 * serves OpenShift groups (`openShift`); everything else is the same on every cluster.
 */
export function workloadObjects(nextUid: () => string, openShift: boolean): K8sResource[] {
  return [
    ...statefulSetObjects(nextUid),
    ...daemonSetObjects(nextUid),
    ...standaloneControllerObjects(nextUid),
    ...batchObjects(nextUid),
    ...autoscaledObjects(nextUid),
    ...secretObjects(nextUid),
    // Last, so the uids above don't depend on the cluster's distribution.
    ...(openShift ? deploymentConfigObjects(nextUid) : []),
  ];
}
