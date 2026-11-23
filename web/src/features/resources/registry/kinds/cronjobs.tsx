import { CronJobModel, type CronJob, type K8sResource } from '@/shared/k8s';
import { ageColumn, nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed CronJob (`metadata` always present). */
export type CronJobResource = CronJob & K8sResource;

/**
 * CronJobs (WL-1, OCP `cron-job.tsx`): minimal descriptor from the CP4b foundation (T-0189) — Name, Namespace, Created. Columns,
 * details and actions are filled in by T-0194.
 */
export const cronJobDescriptor: ResourceDescriptor<CronJobResource> = {
  model: CronJobModel,
  nav: { section: 'workloads', order: 70 },
  extraTabs: ['jobs'],
  columns: [nameColumn(CronJobModel), namespaceColumn(CronJobModel), ageColumn()],
};
