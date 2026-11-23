import { useMemo } from 'react';
import {
  HorizontalPodAutoscalerModel,
  useK8sList,
  type HorizontalPodAutoscaler,
  type K8sResource,
} from '@/shared/k8s';

/** The API group of an `apiVersion` (`apps/v1` → `apps`, `v1` → `''`). */
function apiGroup(apiVersion: string): string {
  const slash = apiVersion.indexOf('/');
  return slash < 0 ? '' : apiVersion.slice(0, slash);
}

/**
 * The HorizontalPodAutoscaler that scales `obj`, if any (OCP `useRelatedHPA` / `doesHpaMatch`): the namespace's HPAs
 * whose `spec.scaleTargetRef` names `obj`'s group, kind and name. The version is not compared, so an HPA written
 * against another version of the same group still matches. Watches the whole namespace under the same key as the HPA
 * list page, so all workloads of a namespace share one watch. `undefined` while loading, on error (e.g. no `list`
 * permission), while disabled and when none matches: the workload then counts as manually scaled. Pass
 * `enabled: false` where many rows would each open a watch (list kebabs, FRONTEND.md watch budget).
 */
export function useRelatedHPA(
  cluster: string,
  obj: K8sResource,
  { enabled = true }: { enabled?: boolean } = {},
): HorizontalPodAutoscaler | undefined {
  const hpas = useK8sList<HorizontalPodAutoscaler>(cluster, HorizontalPodAutoscalerModel, {
    namespace: obj.metadata.namespace,
    enabled,
  });
  const { apiVersion, kind } = obj;
  const name = obj.metadata.name;
  return useMemo(() => {
    const group = apiGroup(apiVersion);
    return hpas.data?.find((hpa) => {
      const ref = hpa.spec?.scaleTargetRef;
      return ref?.kind === kind && ref.name === name && apiGroup(ref.apiVersion ?? '') === group;
    });
  }, [hpas.data, apiVersion, kind, name]);
}
