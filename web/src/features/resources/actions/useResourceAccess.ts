import { useCurrentUser } from '@/features/auth';
import { useAccessibleClusters } from '@/features/cluster-context';
import { useCanI, type AccessVerb, type K8sModel } from '@/shared/k8s';

/** UI-9 reason 1, identical to the proxy's 403 `Proxy.UserReadOnly` detail. */
export const USER_READ_ONLY_REASON = 'Your account is read-only.';

/** UI-9 reason 2, identical to the proxy's 403 `Proxy.ReadOnlyGrant` detail. */
export function readOnlyGrantReason(cluster: string): string {
  return `Your access to ${cluster} is read-only.`;
}

/**
 * UI-9 reason 3: the cluster's RBAC denies the grant's ServiceAccount; no "in <ns>" for cluster-scoped checks. A
 * subresource is named the RBAC way, e.g. "cannot patch deployments/scale in shop".
 */
export function rbacDeniedReason(
  cluster: string,
  verb: string,
  model: K8sModel,
  namespace?: string,
  subresource?: string,
): string {
  const where = model.namespaced && namespace ? ` in ${namespace}` : '';
  const resource = subresource ? `${model.plural}/${subresource}` : model.plural;
  return `The service account for ${cluster} cannot ${verb} ${resource}${where} (cluster RBAC).`;
}

/** The write a control would perform; see {@link useResourceAccess}. */
export interface ResourceAccessReview {
  verb: AccessVerb;
  model: K8sModel;
  /** E.g. `scale` (`patch deployments/scale`) or `exec` (`create pods/exec`). */
  subresource?: string;
  /** Ignored for cluster-scoped kinds. */
  namespace?: string;
  /** Omitted by list rows: one namespace-level check serves every row (ADR-0022 §9). */
  name?: string;
}

/** Result of {@link useResourceAccess}. */
export interface ResourceAccess {
  /** The answer is not known yet: render the control aria-disabled without a tooltip. */
  isChecking: boolean;
  /** Why the write is not allowed (first applicable reason), or `undefined` when allowed or still checking. */
  disabledReason: string | undefined;
}

/** Options of {@link useResourceAccess}. */
export interface ResourceAccessOptions {
  /**
   * `false` when the review does not apply (e.g. a ReplicaSet without an owning Deployment): no
   * SelfSubjectAccessReview is sent and the result fails closed — `isChecking` stays `true`, so a control rendered
   * anyway is aria-disabled. Callers are expected not to render the control. Defaults to `true`.
   */
  enabled?: boolean;
}

/**
 * Whether the user may perform a write on a resource of `cluster` and, if not, the first applicable reason (UI-9,
 * ADR-0014): the user's global read-only flag, then the grant's ReadOnly access mode — both known from FleetConsole
 * alone, so no SelfSubjectAccessReview is sent for them — then the cluster's RBAC for the grant's ServiceAccount
 * (`useCanI`, deduplicated and cached per query key). The proxy still enforces everything; callers show its 403.
 * See {@link ResourceAccessOptions.enabled} to skip the review entirely.
 */
export function useResourceAccess(
  cluster: string,
  review: ResourceAccessReview,
  { enabled = true }: ResourceAccessOptions = {},
): ResourceAccess {
  const { data: me } = useCurrentUser();
  const { data: clusters } = useAccessibleClusters();
  const { verb, model, name, subresource } = review;
  const namespace = model.namespaced ? review.namespace : undefined;

  let fleetReason: string | undefined;
  if (me?.isReadOnly) {
    fleetReason = USER_READ_ONLY_REASON;
  } else if (clusters?.find((entry) => entry.name === cluster)?.accessMode === 'readOnly') {
    fleetReason = readOnlyGrantReason(cluster);
  }
  // Ask the cluster only once FleetConsole's own gates are known to pass.
  const needsReview = enabled && fleetReason === undefined && me !== undefined && clusters !== undefined;
  const { allowed } = useCanI(
    cluster,
    { verb, model, namespace, name, subresource },
    { enabled: needsReview },
  );

  if (!enabled) {
    return { isChecking: true, disabledReason: undefined };
  }
  if (fleetReason !== undefined) {
    return { isChecking: false, disabledReason: fleetReason };
  }
  if (!needsReview || allowed === undefined) {
    return { isChecking: true, disabledReason: undefined };
  }
  return {
    isChecking: false,
    disabledReason: allowed ? undefined : rbacDeniedReason(cluster, verb, model, namespace, subresource),
  };
}
