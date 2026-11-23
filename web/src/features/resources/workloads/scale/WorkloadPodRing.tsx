import type { K8sModel, K8sResource } from '@/shared/k8s';
import { useResourceAccess } from '../../actions/useResourceAccess';
import { PodRing } from '../../components/PodRing';
import { useRelatedHPA } from './useRelatedHPA';
import { useScaleWorkload } from './useScaleWorkload';

/** A scalable workload, as far as the ring reads it. */
export type ScalableWorkload = K8sResource & {
  spec?: { replicas?: number; selector?: { matchLabels?: Record<string, string> } };
  status?: { readyReplicas?: number };
};

/** Props for {@link WorkloadPodRing}. */
export interface WorkloadPodRingProps {
  cluster: string;
  model: K8sModel;
  obj: ScalableWorkload;
  /** The pod selector; defaults to `spec.selector.matchLabels` (DeploymentConfigs and RCs pass `spec.selector`). */
  selector?: Record<string, string>;
}

/**
 * A scalable workload's ring with OCP's scale arrows (DEP-5): one `…/scale` PATCH per burst of clicks via
 * {@link useScaleWorkload} (failures toast). As OCP's `PodRing` `isScalingAllowed`, the arrows render only once `patch
 * <plural>/scale` is allowed (absent while the review is pending, so they never flash for a read-only user, and when
 * denied) and no HPA scales the workload; under an HPA the label reads "Autoscaled to N Pods" (HPA-1).
 */
export function WorkloadPodRing({ cluster, model, obj, selector }: WorkloadPodRingProps) {
  const target = { namespace: obj.metadata.namespace, name: obj.metadata.name ?? '' };
  const scale = useScaleWorkload(cluster, model, { toastErrors: { action: 'Scale' } });
  const access = useResourceAccess(cluster, { verb: 'patch', model, subresource: 'scale', ...target });
  const hpa = useRelatedHPA(cluster, obj);

  return (
    <PodRing
      cluster={cluster}
      workload={obj}
      selector={selector ?? obj.spec?.selector?.matchLabels}
      hpa={hpa}
      scale={{
        desired: obj.spec?.replicas ?? 1,
        onScale: (replicas) => scale.mutateAsync({ ...target, replicas }),
        allowed: !access.isChecking && access.disabledReason === undefined,
      }}
    />
  );
}
