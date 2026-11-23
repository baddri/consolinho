import { JobModel, type Job, type K8sResource } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Job (`metadata` always present). */
export type JobResource = Job & K8sResource;

/**
 * Jobs (WL-1, OCP `job.tsx`): minimal descriptor from the CP4b foundation (T-0189) — Name, Namespace, Created. Columns,
 * details and actions are filled in by T-0194.
 */
export const jobDescriptor: ResourceDescriptor<JobResource> = {
  model: JobModel,
  nav: { section: 'workloads', order: 80 },
  columns: [nameColumn(JobModel), namespaceColumn(JobModel), ageColumn()],
};
