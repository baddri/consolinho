import type {
  ClusterServiceVersion,
  ClusterServiceVersionPhase,
  InstallPlan,
  K8sResource,
  Subscription,
} from '@/shared/k8s';

/** One API an operator provides (`spec.customresourcedefinitions.owned[]`, `spec.apiservicedefinitions.owned[]`). */
export interface ProvidedApi {
  name: string;
  version?: string;
  kind: string;
  displayName?: string;
  description?: string;
}

/**
 * A listed ClusterServiceVersion with the fields Installed Operators reads beyond the shared `ClusterServiceVersion`
 * (OCP `ClusterServiceVersionKind`): provided APIs, links, maintainers, install deployments/permissions and
 * `status.lastUpdateTime`.
 */
export type CsvResource = K8sResource &
  ClusterServiceVersion & {
    spec?: NonNullable<ClusterServiceVersion['spec']> & {
      customresourcedefinitions?: { owned?: ProvidedApi[] };
      apiservicedefinitions?: { owned?: ProvidedApi[] };
      links?: { name?: string; url?: string }[];
      maintainers?: { name?: string; email?: string }[];
      install?: {
        spec?: {
          deployments?: { name: string }[];
          permissions?: { serviceAccountName: string }[];
        };
      };
    };
    status?: NonNullable<ClusterServiceVersion['status']> & { lastUpdateTime?: string };
  };

/** A Subscription with OLM's `status.catalogHealth` (OCP `SubscriptionKind`), which the Upgrade status reads. */
export type SubscriptionResource = K8sResource &
  Subscription & {
    status?: NonNullable<Subscription['status']> & {
      catalogHealth?: { catalogSourceRef: { name: string; namespace?: string }; healthy: boolean }[];
    };
  };

/** CSV phases offered by the list's Status filter, in OCP `ClusterServiceVersionPhase` order. */
export const CSV_PHASES: readonly ClusterServiceVersionPhase[] = [
  'Pending',
  'Installing',
  'Succeeded',
  'Failed',
  'Replacing',
  'Deleting',
  'Unknown',
];

/** The phase shown for a CSV: `Deleting` while it is being deleted (OCP `ClusterServiceVersionStatus`), else `status.phase`. */
export function csvPhase(csv: CsvResource): ClusterServiceVersionPhase | undefined {
  return csv.metadata.deletionTimestamp ? 'Deleting' : csv.status?.phase;
}

const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * `src` of the CSV's icon (OCP `ClusterServiceVersionHeaderIcon`) as a `data:` URI, or `undefined` for the
 * placeholder. Only an image media type with base64 data qualifies: the CSP allows `img-src 'self' data:` and a
 * CSV author must never make the browser fetch a URL of theirs.
 */
export function csvIconSrc(csv: Pick<ClusterServiceVersion, 'spec'>): string | undefined {
  const [icon] = csv.spec?.icon ?? [];
  const mediaType = icon?.mediatype.trim().toLowerCase();
  const data = icon?.base64data.replace(/\s/g, '');
  if (!mediaType || !data || !IMAGE_MEDIA_TYPES.has(mediaType) || !BASE64.test(data)) return undefined;
  return `data:${mediaType};base64,${data}`;
}

/** Whether OLM copied this CSV from its operator namespace (`olm.copiedFrom`, OCP `isCopiedCSV`). */
export function isCopiedCsv(csv: CsvResource): boolean {
  return csv.metadata.labels?.['olm.copiedFrom'] !== undefined || csv.status?.reason === 'Copied';
}

/**
 * Namespaces the operator manages, from the OperatorGroup's `olm.targetNamespaces` annotation (OCP
 * `targetNamespacesFor`); `[]` means all namespaces (annotation absent or empty).
 */
export function targetNamespaces(csv: CsvResource): string[] {
  return (csv.metadata.annotations?.['olm.targetNamespaces'] ?? '').split(',').filter(Boolean);
}

/** Namespace the operator runs in (`olm.operatorNamespace`, OCP `operatorNamespaceFor`), else the CSV's own. */
export function operatorNamespace(csv: CsvResource): string | undefined {
  return csv.metadata.annotations?.['olm.operatorNamespace'] ?? csv.metadata.namespace;
}

/** The OperatorGroup that installed the operator (`olm.operatorGroup`, OCP `operatorGroupFor`). */
export function operatorGroup(csv: CsvResource): string | undefined {
  return csv.metadata.annotations?.['olm.operatorGroup'];
}

/** Owned CRDs then owned API services (OCP `providedAPIsForCSV`). */
export function providedApis(csv: CsvResource): ProvidedApi[] {
  return [...(csv.spec?.customresourcedefinitions?.owned ?? []), ...(csv.spec?.apiservicedefinitions?.owned ?? [])];
}

/** Display text of a provided API: its display name, else its kind (OCP `CsvProvidedAPIsCell`). */
export function providedApiName(api: ProvidedApi): string {
  return api.displayName ?? api.kind;
}

/**
 * Whether the subscription's pending upgrade waits for a manual approval: state `UpgradePending` with OLM's
 * `RequiresApproval` condition (OCP `upgradeRequiresApproval`), or its InstallPlan is Manual and not yet approved.
 */
export function upgradeRequiresApproval(subscription: SubscriptionResource, installPlan?: InstallPlan): boolean {
  if (subscription.status?.state !== 'UpgradePending') return false;
  const condition = (subscription.status.conditions ?? []).some(
    ({ status, reason }) => status === 'True' && reason === 'RequiresApproval',
  );
  return condition || (installPlan?.spec?.approval === 'Manual' && installPlan.spec.approved === false);
}

/** `url` when it is an absolute http(s) URL, the only links a CSV author may hand the browser. */
export function httpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}
