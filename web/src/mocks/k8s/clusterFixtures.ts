import type {
  ClusterOperator,
  ClusterServiceVersion,
  ClusterVersion,
  Infrastructure,
  InstallPlan,
  K8sCondition,
  K8sResource,
  Subscription,
} from '@/shared/k8s';
import { FIXTURE_NOW } from '../fixtures/time';
import { infrastructureName } from './computeFixtures';
import { k8sTime } from './fixtures';

/**
 * CP5b cluster and operator fixtures (T-0331, Lane O owns this file afterwards), OpenShift clusters only: the
 * ClusterVersion `version` (history, channel, two available updates), ten ClusterOperators, the Infrastructure
 * `cluster`, and OLM objects in `openshift-operators` — a Succeeded CSV copied into `shop` and `payments`
 * (`olm.copiedFrom`), a Failed and an Installing one, their Subscriptions and an InstallPlan awaiting manual approval.
 *
 * Scenarios (mirror the MSW fleet table, T-0341): `dev-2` has the `ingress` operator Degraded; `staging-eu-1` is
 * updating to the next version (ClusterVersion and two operators Progressing). `prod-us-1` hides ClusterOperators from
 * the view credential through RBAC (`rbac.ts`), not here.
 */

const MINUTE_MS = 60_000;
const DAY_MINUTES = 60 * 24;
const OPERATORS_NAMESPACE = 'openshift-operators';
const CURRENT = '4.18.12';
const PREVIOUS = '4.18.9';
const UPDATES = ['4.18.14', '4.18.15'] as const;
const CHANNEL = 'stable-4.18';
const RELEASE_IMAGE = 'quay.io/example/release';
const DEGRADED_OPERATOR: Readonly<Record<string, string>> = { 'dev-2': 'ingress' };
const UPDATING: ReadonlySet<string> = new Set(['staging-eu-1']);
/** Operators still rolling out the new version while `staging-eu-1` updates. */
const PROGRESSING_WHILE_UPDATING: ReadonlySet<string> = new Set(['kube-apiserver', 'machine-config']);
/** A tiny fake operator icon (a grey rounded square). */
const FAKE_ICON =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMyIgZmlsbD0iIzZhNmU3MyIvPjwvc3ZnPg==';

function minutesBefore(minutes: number): string {
  return k8sTime(FIXTURE_NOW - minutes * MINUTE_MS);
}

function condition(
  type: string,
  status: K8sCondition['status'],
  reason?: string,
  message?: string,
  minutesAgo = 30 * DAY_MINUTES,
): K8sCondition {
  return {
    type,
    status,
    ...(reason ? { reason } : {}),
    ...(message ? { message } : {}),
    lastTransitionTime: minutesBefore(minutesAgo),
  };
}

function release(version: string) {
  return {
    version,
    image: `${RELEASE_IMAGE}@sha256:fake${version.replaceAll('.', '')}`,
    channels: [CHANNEL, 'fast-4.18'],
  };
}

/** ClusterVersion `version`: at {@link CURRENT}, or (updating clusters) Progressing towards the first update. */
function clusterVersion(cluster: string, uid: string): ClusterVersion {
  const updating = UPDATING.has(cluster);
  const target = UPDATES[0];
  return {
    apiVersion: 'config.openshift.io/v1',
    kind: 'ClusterVersion',
    metadata: { name: 'version', uid, creationTimestamp: minutesBefore(90 * DAY_MINUTES) },
    spec: {
      channel: CHANNEL,
      clusterID: uid,
      upstream: 'https://updates.example.com/api/upgrades_info/v1/graph',
      ...(updating ? { desiredUpdate: { version: target, image: release(target).image } } : {}),
    },
    status: {
      desired: release(updating ? target : CURRENT),
      history: [
        ...(updating
          ? [
              {
                state: 'Partial' as const,
                version: target,
                image: release(target).image,
                startedTime: minutesBefore(25),
                completionTime: null,
                verified: true,
              },
            ]
          : []),
        {
          state: 'Completed',
          version: CURRENT,
          image: release(CURRENT).image,
          startedTime: minutesBefore(20 * DAY_MINUTES),
          completionTime: minutesBefore(20 * DAY_MINUTES - 70),
          verified: true,
        },
        {
          state: 'Completed',
          version: PREVIOUS,
          image: release(PREVIOUS).image,
          startedTime: minutesBefore(50 * DAY_MINUTES),
          completionTime: minutesBefore(50 * DAY_MINUTES - 65),
          verified: true,
        },
      ],
      availableUpdates: (updating ? [UPDATES[1], '4.19.2'] : UPDATES).map(release),
      conditions: [
        condition('Available', 'True', undefined, `Done applying ${CURRENT}`),
        condition('Failing', 'False'),
        updating
          ? condition(
              'Progressing',
              'True',
              undefined,
              `Working towards ${target}: 512 of 873 done (58% complete)`,
              25,
            )
          : condition('Progressing', 'False', undefined, `Cluster version is ${CURRENT}`),
        condition('RetrievedUpdates', 'True'),
        condition('Upgradeable', 'True'),
      ],
      observedGeneration: 2,
    },
  };
}

/** Operator name → its operand namespace and operator config resource (`relatedObjects`). */
const CLUSTER_OPERATORS: readonly (readonly [string, string, string])[] = [
  ['authentication', 'openshift-authentication', 'authentications'],
  ['console', 'openshift-console', 'consoles'],
  ['dns', 'openshift-dns', 'dnses'],
  ['etcd', 'openshift-etcd', 'etcds'],
  ['ingress', 'openshift-ingress', 'ingresscontrollers'],
  ['kube-apiserver', 'openshift-kube-apiserver', 'kubeapiservers'],
  ['machine-api', 'openshift-machine-api', 'machineapis'],
  ['machine-config', 'openshift-machine-config-operator', 'machineconfigurations'],
  ['monitoring', 'openshift-monitoring', 'monitorings'],
  ['network', 'openshift-network-operator', 'networks'],
];

function clusterOperator(
  cluster: string,
  [name, namespace, resource]: readonly [string, string, string],
  uid: string,
): ClusterOperator {
  const degraded = DEGRADED_OPERATOR[cluster] === name;
  const progressing = UPDATING.has(cluster) && PROGRESSING_WHILE_UPDATING.has(name);
  return {
    apiVersion: 'config.openshift.io/v1',
    kind: 'ClusterOperator',
    metadata: { name, uid, creationTimestamp: minutesBefore(90 * DAY_MINUTES) },
    spec: {},
    status: {
      conditions: [
        condition('Available', 'True', 'AsExpected'),
        progressing
          ? condition(
              'Progressing',
              'True',
              'NodeInstaller',
              `Rolling out ${UPDATES[0]}: 1 of 3 nodes updated`,
              20,
            )
          : condition('Progressing', 'False', 'AsExpected'),
        degraded
          ? condition(
              'Degraded',
              'True',
              'IngressDegraded',
              'The "default" ingress controller reports Degraded=True: 1 of 2 router pods are not ready.',
              50,
            )
          : condition('Degraded', 'False', 'AsExpected'),
        condition('Upgradeable', 'True', 'AsExpected'),
      ],
      versions: [{ name: 'operator', version: CURRENT }],
      relatedObjects: [
        { group: '', resource: 'namespaces', name: namespace },
        {
          group: 'operator.openshift.io',
          resource,
          name: name === 'ingress' ? 'default' : 'cluster',
          ...(name === 'ingress' ? { namespace: 'openshift-ingress-operator' } : {}),
        },
      ],
    },
  };
}

function infrastructure(cluster: string, uid: string): Infrastructure {
  return {
    apiVersion: 'config.openshift.io/v1',
    kind: 'Infrastructure',
    metadata: { name: 'cluster', uid, creationTimestamp: minutesBefore(90 * DAY_MINUTES) },
    spec: { platformSpec: { type: 'AWS' } },
    status: {
      platform: 'AWS',
      platformStatus: { type: 'AWS' },
      infrastructureName: infrastructureName(cluster),
      apiServerURL: `https://api.${cluster}.example.com:6443`,
      apiServerInternalURI: `https://api-int.${cluster}.example.com:6443`,
      controlPlaneTopology: 'HighlyAvailable',
      infrastructureTopology: 'HighlyAvailable',
    },
  };
}

interface CsvPlan {
  name: string;
  displayName: string;
  version: string;
  phase: 'Succeeded' | 'Failed' | 'Installing';
  reason: string;
  message: string;
  allNamespaces: boolean;
}

const CSVS: readonly CsvPlan[] = [
  {
    name: 'cert-utils-operator.v1.3.12',
    displayName: 'Cert Utils Operator',
    version: '1.3.12',
    phase: 'Succeeded',
    reason: 'InstallSucceeded',
    message: 'install strategy completed with no errors',
    allNamespaces: true,
  },
  {
    name: 'log-forwarder-operator.v5.9.3',
    displayName: 'Log Forwarder Operator',
    version: '5.9.3',
    phase: 'Failed',
    reason: 'InstallComponentFailed',
    message:
      'install strategy failed: Deployment.apps "log-forwarder-operator" is invalid: spec.template.spec.containers[0].image: Required value',
    allNamespaces: false,
  },
  {
    name: 'pipeline-runner-operator.v1.15.0',
    displayName: 'Pipeline Runner Operator',
    version: '1.15.0',
    phase: 'Installing',
    reason: 'InstallWaiting',
    message:
      'installing: waiting for deployment pipeline-runner-operator to become ready: 0 of 1 updated replicas are available',
    allNamespaces: false,
  },
];

/** The CSV of `plan` in `namespace`; copies (outside `openshift-operators`) carry `olm.copiedFrom` as OLM writes them. */
function csvObject(plan: CsvPlan, namespace: string, uid: string): ClusterServiceVersion {
  const copied = namespace !== OPERATORS_NAMESPACE;
  return {
    apiVersion: 'operators.coreos.com/v1alpha1',
    kind: 'ClusterServiceVersion',
    metadata: {
      name: plan.name,
      namespace,
      uid,
      creationTimestamp: minutesBefore(plan.phase === 'Succeeded' ? 10 * DAY_MINUTES : 15),
      labels: {
        [`operators.coreos.com/${plan.name.split('.')[0] ?? plan.name}.${OPERATORS_NAMESPACE}`]: '',
        ...(copied ? { 'olm.copiedFrom': OPERATORS_NAMESPACE } : {}),
      },
    },
    spec: {
      displayName: plan.displayName,
      description: `${plan.displayName} for the mock clusters.`,
      version: plan.version,
      provider: { name: 'Example Community' },
      icon: [{ base64data: FAKE_ICON, mediatype: 'image/svg+xml' }],
      installModes: [
        { type: 'OwnNamespace', supported: true },
        { type: 'SingleNamespace', supported: true },
        { type: 'MultiNamespace', supported: false },
        { type: 'AllNamespaces', supported: plan.allNamespaces },
      ],
    },
    status: {
      phase: plan.phase,
      reason: copied ? 'Copied' : plan.reason,
      message: copied
        ? 'The operator is running in openshift-operators but is managing this namespace'
        : plan.message,
      conditions: [
        {
          phase: plan.phase,
          reason: plan.reason,
          message: plan.message,
          lastTransitionTime: minutesBefore(10),
        },
      ],
    },
  };
}

/**
 * The OLM objects: three CSVs (the Succeeded one copied into `shop` and `payments`), a Subscription per CSV and, for
 * the Succeeded operator's Manual subscription, an InstallPlan to the next version waiting for approval.
 */
function olmObjects(nextUid: () => string): K8sResource[] {
  const [succeeded] = CSVS;
  const csvs = CSVS.flatMap((plan) => [
    csvObject(plan, OPERATORS_NAMESPACE, nextUid()),
    ...(plan === succeeded
      ? ['shop', 'payments'].map((namespace) => csvObject(plan, namespace, nextUid()))
      : []),
  ]);
  const pendingCsv = 'cert-utils-operator.v1.3.13';
  const installPlan: InstallPlan = {
    apiVersion: 'operators.coreos.com/v1alpha1',
    kind: 'InstallPlan',
    metadata: {
      name: 'install-7q2xk',
      namespace: OPERATORS_NAMESPACE,
      uid: nextUid(),
      creationTimestamp: minutesBefore(120),
    },
    spec: { clusterServiceVersionNames: [pendingCsv], approval: 'Manual', approved: false },
    status: {
      phase: 'RequiresApproval',
      catalogSources: ['community-operators'],
      conditions: [condition('Installed', 'False', 'RequiresApproval', undefined, 120)],
    },
  };
  const subscriptions = CSVS.map((plan): Subscription => {
    const packageName = plan.name.split('.')[0] ?? plan.name;
    const manual = plan === succeeded;
    return {
      apiVersion: 'operators.coreos.com/v1alpha1',
      kind: 'Subscription',
      metadata: {
        name: packageName,
        namespace: OPERATORS_NAMESPACE,
        uid: nextUid(),
        creationTimestamp: minutesBefore(plan.phase === 'Succeeded' ? 10 * DAY_MINUTES : 15),
      },
      spec: {
        name: packageName,
        source: 'community-operators',
        sourceNamespace: 'openshift-marketplace',
        channel: 'stable',
        installPlanApproval: manual ? 'Manual' : 'Automatic',
      },
      status: {
        state: manual ? 'UpgradePending' : 'AtLatestKnown',
        currentCSV: manual ? pendingCsv : plan.name,
        installedCSV: plan.name,
        ...(manual
          ? {
              installPlanRef: {
                apiVersion: 'operators.coreos.com/v1alpha1',
                kind: 'InstallPlan',
                name: installPlan.metadata.name,
                namespace: OPERATORS_NAMESPACE,
                uid: installPlan.metadata.uid,
              },
            }
          : {}),
        lastUpdated: minutesBefore(5),
      },
    };
  });
  return [...csvs, ...subscriptions, installPlan] as K8sResource[];
}

/**
 * The cluster-level and OLM objects of `cluster`; none on clusters that don't serve the OpenShift groups
 * (`openShift` false). Seeded after the compute objects so existing uids stay put.
 */
export function clusterObjects(cluster: string, nextUid: () => string, openShift: boolean): K8sResource[] {
  if (!openShift) return [];
  return [
    clusterVersion(cluster, nextUid()),
    infrastructure(cluster, nextUid()),
    ...CLUSTER_OPERATORS.map((operator) => clusterOperator(cluster, operator, nextUid())),
    ...olmObjects(nextUid),
  ] as K8sResource[];
}
