import { HorizontalPodAutoscalerModel, type HorizontalPodAutoscaler, type K8sResource } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed HorizontalPodAutoscaler (`metadata` always present). */
export type HorizontalPodAutoscalerResource = HorizontalPodAutoscaler & K8sResource;

/**
 * HorizontalPodAutoscalers (WL-1, OCP `hpa.tsx`): minimal descriptor from the CP4b foundation (T-0189) — Name, Namespace, Created. Columns,
 * details and actions are filled in by T-0195.
 */
export const horizontalPodAutoscalerDescriptor: ResourceDescriptor<HorizontalPodAutoscalerResource> = {
  model: HorizontalPodAutoscalerModel,
  nav: { section: 'workloads', order: 120 },
  columns: [
    nameColumn(HorizontalPodAutoscalerModel),
    namespaceColumn(HorizontalPodAutoscalerModel),
    ageColumn(),
  ],
};
