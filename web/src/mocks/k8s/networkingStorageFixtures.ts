import type {
  Ingress,
  K8sResource,
  NetworkPolicy,
  PersistentVolume,
  PersistentVolumeClaim,
  Route,
  Secret,
  StorageClass,
} from '@/shared/k8s';
import { FIXTURE_NOW } from '../fixtures/time';
import { k8sTime } from './fixtures';

/**
 * CP5a networking and storage fixtures (T-0300): StorageClasses, PersistentVolumes in every phase the lists show,
 * PVCs (bound, expansion disabled, pending, resize pending), Routes (OpenShift clusters only) in every admission
 * state, an Ingress with its TLS secret and three NetworkPolicies. Namespaced objects live in `shop`. Every
 * certificate and key is obviously fake.
 */

const NAMESPACE = 'shop';
const MINUTE_MS = 60_000;
const DAY_MINUTES = 60 * 24;
const CSI_DRIVER = 'csi.example.com';
const FAKE_CERT = '-----BEGIN CERTIFICATE-----\nFAKE-CERT\n-----END CERTIFICATE-----\n';
const FAKE_KEY = '-----BEGIN PRIVATE KEY-----\nFAKE-KEY\n-----END PRIVATE KEY-----\n';

function minutesBefore(minutes: number): string {
  return k8sTime(FIXTURE_NOW - minutes * MINUTE_MS);
}

/** Metadata of a fixture object; `namespace` omitted for cluster-scoped kinds. */
function meta(name: string, uid: string, namespace: string | undefined, createdDaysAgo: number) {
  return {
    name,
    uid,
    ...(namespace === undefined ? {} : { namespace }),
    creationTimestamp: minutesBefore(createdDaysAgo * DAY_MINUTES),
  };
}

/** `standard-csi` (default, expandable) and `slow-nfs` (no `allowVolumeExpansion`). */
function storageClasses(nextUid: () => string): StorageClass[] {
  return [
    {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: {
        ...meta('standard-csi', nextUid(), undefined, 90),
        annotations: { 'storageclass.kubernetes.io/is-default-class': 'true' },
      },
      provisioner: CSI_DRIVER,
      parameters: { type: 'ssd', 'csi.storage.k8s.io/fstype': 'xfs' },
      reclaimPolicy: 'Delete',
      allowVolumeExpansion: true,
      volumeBindingMode: 'WaitForFirstConsumer',
    },
    {
      apiVersion: 'storage.k8s.io/v1',
      kind: 'StorageClass',
      metadata: meta('slow-nfs', nextUid(), undefined, 90),
      provisioner: 'example.com/nfs',
      reclaimPolicy: 'Retain',
      volumeBindingMode: 'Immediate',
    },
  ];
}

/** Claim reference of a PV bound to `shop/<claim>`. */
function claimRef(claim: string) {
  return { kind: 'PersistentVolumeClaim', namespace: NAMESPACE, name: claim, apiVersion: 'v1' };
}

/** PVs: three Bound (CSI with node affinity, NFS, the dynamically provisioned `resizing` one), one Available, one Released. */
function persistentVolumes(nextUid: () => string): PersistentVolume[] {
  const pv = (
    name: string,
    storageClassName: string,
    storage: string,
    phase: string,
    spec: PersistentVolume['spec'],
  ): PersistentVolume => ({
    apiVersion: 'v1',
    kind: 'PersistentVolume',
    metadata: meta(name, nextUid(), undefined, 30),
    spec: {
      capacity: { storage },
      accessModes: ['ReadWriteOnce'],
      persistentVolumeReclaimPolicy: 'Delete',
      storageClassName,
      volumeMode: 'Filesystem',
      ...spec,
    },
    status: { phase },
  });
  return [
    pv('pv-db-data', 'standard-csi', '10Gi', 'Bound', {
      claimRef: claimRef('db-data'),
      csi: { driver: CSI_DRIVER, volumeHandle: 'vol-0a1b2c3d', fsType: 'xfs' },
      nodeAffinity: {
        required: {
          nodeSelectorTerms: [
            { matchExpressions: [{ key: 'topology.kubernetes.io/zone', operator: 'In', values: ['zone-a'] }] },
          ],
        },
      },
    }),
    pv('pv-uploads', 'slow-nfs', '50Gi', 'Bound', {
      claimRef: claimRef('uploads'),
      accessModes: ['ReadWriteMany'],
      persistentVolumeReclaimPolicy: 'Retain',
      nfs: { server: 'nfs.example.com', path: '/exports/uploads' },
    }),
    pv('pv-spare', 'slow-nfs', '20Gi', 'Available', {
      persistentVolumeReclaimPolicy: 'Retain',
      nfs: { server: 'nfs.example.com', path: '/exports/spare' },
    }),
    pv('pv-old', 'slow-nfs', '5Gi', 'Released', {
      claimRef: claimRef('old-reports'),
      persistentVolumeReclaimPolicy: 'Retain',
      nfs: { server: 'nfs.example.com', path: '/exports/old-reports' },
    }),
    // Provisioned for `shop/resizing`; still 4Gi while its file system resize is pending.
    pv('pvc-resizing-0f9e', 'standard-csi', '4Gi', 'Bound', {
      claimRef: claimRef('resizing'),
      csi: { driver: CSI_DRIVER, volumeHandle: 'vol-4e5f6a7b', fsType: 'xfs' },
    }),
  ];
}

/** PVCs in `shop`; `db-data` is mounted by the `db-*` StatefulSet pods (`workloadFixtures.ts`). */
function persistentVolumeClaims(nextUid: () => string): PersistentVolumeClaim[] {
  const pvc = (
    name: string,
    storageClassName: string,
    storage: string,
    volumeName: string | undefined,
    status: PersistentVolumeClaim['status'],
    accessMode = 'ReadWriteOnce',
  ): PersistentVolumeClaim => ({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: meta(name, nextUid(), NAMESPACE, 30),
    spec: {
      accessModes: [accessMode],
      resources: { requests: { storage } },
      storageClassName,
      volumeMode: 'Filesystem',
      ...(volumeName === undefined ? {} : { volumeName }),
    },
    status,
  });
  const bound = (storage: string, accessMode = 'ReadWriteOnce'): PersistentVolumeClaim['status'] => ({
    phase: 'Bound',
    accessModes: [accessMode],
    capacity: { storage },
  });
  return [
    pvc('db-data', 'standard-csi', '10Gi', 'pv-db-data', bound('10Gi')),
    pvc('uploads', 'slow-nfs', '50Gi', 'pv-uploads', bound('50Gi', 'ReadWriteMany'), 'ReadWriteMany'),
    pvc('scratch', 'standard-csi', '1Gi', undefined, { phase: 'Pending' }),
    // The request was raised to 8Gi; the file system grows when a pod next mounts the volume.
    pvc('resizing', 'standard-csi', '8Gi', 'pvc-resizing-0f9e', {
      ...bound('4Gi'),
      conditions: [
        {
          type: 'FileSystemResizePending',
          status: 'True',
          lastTransitionTime: minutesBefore(15),
          message: 'Waiting for user to (re-)start a pod to finish file system resize of volume on node.',
        },
      ],
    }),
  ];
}

/** Admission of a Route by the default router: `Admitted` True, or False with `reason`. */
function admitted(host: string, cluster: string, reason?: string): NonNullable<Route['status']> {
  return {
    ingress: [
      {
        host,
        routerName: 'default',
        routerCanonicalHostname: `router-default.apps.${cluster}.example.com`,
        wildcardPolicy: 'None',
        conditions: [
          {
            type: 'Admitted',
            status: reason === undefined ? 'True' : 'False',
            lastTransitionTime: minutesBefore(2 * DAY_MINUTES),
            ...(reason === undefined
              ? {}
              : { reason, message: `route ${host} already claimed by another namespace` }),
          },
        ],
      },
    ],
  };
}

/** Routes in `shop`: secured edge, canary split, pending (no router yet), rejected and wildcard. */
function routes(cluster: string, nextUid: () => string): Route[] {
  const apps = `apps.${cluster}.example.com`;
  const route = (name: string, spec: Route['spec'], status: Route['status']): Route => ({
    apiVersion: 'route.openshift.io/v1',
    kind: 'Route',
    metadata: { ...meta(name, nextUid(), NAMESPACE, 10), labels: { app: 'web' } },
    spec: { wildcardPolicy: 'None', ...spec },
    ...(status === undefined ? {} : { status }),
  });
  const web = { kind: 'Service', name: 'web', weight: 100 };
  const webHost = `web-shop.${apps}`;
  const canaryHost = `web-canary-shop.${apps}`;
  const rejectedHost = `web-shop.${apps}`;
  const wildcardHost = `*.wild.${apps}`;
  return [
    route(
      'web',
      {
        host: webHost,
        to: web,
        port: { targetPort: 'http' },
        tls: {
          termination: 'edge',
          insecureEdgeTerminationPolicy: 'Redirect',
          certificate: FAKE_CERT,
          key: FAKE_KEY,
        },
      },
      admitted(webHost, cluster),
    ),
    route(
      'web-canary',
      {
        host: canaryHost,
        path: '/beta',
        to: { ...web, weight: 80 },
        alternateBackends: [{ kind: 'Service', name: 'web-canary', weight: 20 }],
        port: { targetPort: 'http' },
      },
      admitted(canaryHost, cluster),
    ),
    route('pending', { host: `pending-shop.${apps}`, to: web }, undefined),
    route('rejected', { host: rejectedHost, to: web }, admitted(rejectedHost, cluster, 'HostAlreadyClaimed')),
    route(
      'wildcard',
      { host: wildcardHost, to: web, wildcardPolicy: 'Subdomain' },
      admitted(wildcardHost, cluster),
    ),
  ];
}

/** Ingress `shop-ingress` (2 rules, 3 paths to Service `web`) and its TLS secret `shop-tls`. */
function ingressObjects(nextUid: () => string): [Ingress, Secret] {
  const backend = { service: { name: 'web', port: { number: 8080 } } };
  const ingress: Ingress = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: meta('shop-ingress', nextUid(), NAMESPACE, 12),
    spec: {
      ingressClassName: 'openshift-default',
      tls: [{ hosts: ['shop.example.com', 'www.shop.example.com'], secretName: 'shop-tls' }],
      rules: [
        {
          host: 'shop.example.com',
          http: {
            paths: [
              { path: '/', pathType: 'Prefix', backend },
              { path: '/api', pathType: 'Prefix', backend },
            ],
          },
        },
        { host: 'www.shop.example.com', http: { paths: [{ path: '/', pathType: 'Exact', backend }] } },
      ],
    },
    status: { loadBalancer: { ingress: [{ hostname: 'router-default.apps.example.com' }] } },
  };
  const secret: Secret = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: meta('shop-tls', nextUid(), NAMESPACE, 12),
    type: 'kubernetes.io/tls',
    data: { 'tls.crt': btoa(FAKE_CERT), 'tls.key': btoa(FAKE_KEY) },
  };
  return [ingress, secret];
}

/** Deny-all ingress, allow web from the router, and an egress policy with an `ipBlock` exception. */
function networkPolicies(nextUid: () => string): NetworkPolicy[] {
  const policy = (name: string, spec: NetworkPolicy['spec']): NetworkPolicy => ({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: meta(name, nextUid(), NAMESPACE, 8),
    spec,
  });
  return [
    policy('deny-all-ingress', { podSelector: {}, policyTypes: ['Ingress'] }),
    policy('allow-web-from-router', {
      podSelector: { matchLabels: { app: 'web' } },
      policyTypes: ['Ingress'],
      ingress: [
        {
          from: [
            {
              namespaceSelector: {
                matchLabels: { 'network.openshift.io/policy-group': 'ingress' },
              },
              podSelector: { matchLabels: { 'ingresscontroller.operator.openshift.io/deployment-ingresscontroller': 'default' } },
            },
          ],
          ports: [{ port: 8080, protocol: 'TCP' }],
        },
      ],
    }),
    policy('db-egress', {
      podSelector: { matchLabels: { app: 'db' } },
      policyTypes: ['Egress'],
      egress: [
        {
          to: [{ ipBlock: { cidr: '10.0.0.0/16', except: ['10.0.5.0/24'] } }],
          ports: [{ port: 5432, protocol: 'TCP' }],
        },
      ],
    }),
  ];
}

/** The CP5a seed objects of `cluster`; Routes only where OpenShift's `route.openshift.io` is served. */
export function networkingStorageObjects(
  cluster: string,
  nextUid: () => string,
  openShift: boolean,
): K8sResource[] {
  return [
    ...storageClasses(nextUid),
    ...persistentVolumes(nextUid),
    ...persistentVolumeClaims(nextUid),
    ...ingressObjects(nextUid),
    ...networkPolicies(nextUid),
    // Last, so the uids above don't depend on the cluster's distribution.
    ...(openShift ? routes(cluster, nextUid) : []),
  ] as K8sResource[];
}

/**
 * After a patch of a PVC, mirrors a grown `spec.resources.requests.storage` into `status.capacity.storage`, as a
 * CSI driver finishing an online expansion would — so an Expand shows up live. Shrinks and other kinds are left as
 * they are. Returns the object to store.
 */
export function settlePvcResize(object: K8sResource): K8sResource {
  if (object.kind !== 'PersistentVolumeClaim') return object;
  const claim = object as PersistentVolumeClaim & K8sResource;
  const requested = claim.spec?.resources?.requests?.storage;
  const capacity = claim.status?.capacity?.storage;
  if (requested === undefined || claim.status?.phase !== 'Bound') return object;
  if (capacity !== undefined && !(quantityBytes(requested) > quantityBytes(capacity))) return object;
  const status = { ...claim.status, capacity: { ...claim.status.capacity, storage: requested } };
  return { ...claim, status } as K8sResource;
}

const UNITS: Readonly<Record<string, number>> = {
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
};

/** Bytes of a storage quantity (`10Gi`, `500M`); `NaN` for forms the mock doesn't need. */
function quantityBytes(quantity: string): number {
  const match = /^(\d+(?:\.\d+)?)([a-zA-Z]*)$/.exec(quantity);
  const unit = match ? UNITS[match[2] ?? ''] : undefined;
  return match && unit !== undefined ? Number(match[1]) * unit : Number.NaN;
}
