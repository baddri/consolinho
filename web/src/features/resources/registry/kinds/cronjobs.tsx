import { CronJobModel } from '@/shared/k8s';
import {
  CronJobDetails,
  CronJobSections,
  CronJobSummaryExtra,
  booleanText,
  cronJobStatus,
  useCronJobActions,
  type CronJobResource,
} from '../../workloads/cronjobs/cronJobDetails';
import { CronJobPodsTab } from '../../workloads/cronjobs/CronJobPodsTab';
import { nameColumn, namespaceColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { CronJobResource };

/**
 * CronJobs (CJ-1..3, OCP `cron-job.tsx`). List: Name, Namespace, Schedule, Suspend, Concurrency policy, Starting
 * deadline seconds (OCP `cron-job.tsx` L69-77); status "Suspended". Details: metadata plus schedule fields, the job
 * template's completions under a "Job details" heading, and Containers; tabs Details, YAML, Pods (pods of its Jobs), Jobs, Events. Kind
 * actions: Start Job, Suspend / Resume.
 */
export const cronJobDescriptor: ResourceDescriptor<CronJobResource> = {
  model: CronJobModel,
  nav: { section: 'workloads', order: 70 },
  status: cronJobStatus,
  detailsTitle: 'Job details',
  summary: { Extra: CronJobSummaryExtra },
  DetailsSection: CronJobDetails,
  ExtraSections: CronJobSections,
  PodsTab: CronJobPodsTab,
  extraTabs: ['jobs'],
  useKindActions: useCronJobActions,
  columns: [
    nameColumn(CronJobModel),
    namespaceColumn(CronJobModel),
    {
      id: 'schedule',
      title: 'Schedule',
      cell: (cronJob) => cronJob.spec?.schedule ?? '-',
      sortValue: (cronJob) => cronJob.spec?.schedule ?? '',
    },
    {
      id: 'suspend',
      title: 'Suspend',
      cell: (cronJob) => booleanText(cronJob.spec?.suspend),
      sortValue: (cronJob) => booleanText(cronJob.spec?.suspend),
    },
    {
      id: 'concurrencyPolicy',
      title: 'Concurrency policy',
      cell: (cronJob) => cronJob.spec?.concurrencyPolicy ?? '-',
      sortValue: (cronJob) => cronJob.spec?.concurrencyPolicy ?? '',
    },
    {
      id: 'startingDeadlineSeconds',
      title: 'Starting deadline seconds',
      cell: (cronJob) => cronJob.spec?.startingDeadlineSeconds ?? '-',
      sortValue: (cronJob) => cronJob.spec?.startingDeadlineSeconds ?? -1,
    },
  ],
};
