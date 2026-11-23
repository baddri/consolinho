import { JobModel } from '@/shared/k8s';
import {
  JobCompletionsLink,
  JobDetails,
  JobSections,
  JobSummaryExtra,
  jobStatus,
  jobTypeAndCompletions,
  useJobActions,
  type JobResource,
} from '../../workloads/jobs/jobDetails';
import { ageColumn, labelsColumn, nameColumn, namespaceColumn } from '../columns';
import type { ColumnDef, ResourceDescriptor } from '../types';

export type { JobResource };

/** OCP's Completions column: "<succeeded> of <completions>" linking to the Job's Pods tab. */
export const jobCompletionsColumn: ColumnDef<JobResource> = {
  id: 'completions',
  title: 'Completions',
  cell: (job) => <JobCompletionsLink obj={job} />,
  sortValue: (job) => job.status?.succeeded ?? 0,
};

/**
 * Jobs (JOB-1, OCP `job.tsx`). List: Name, Namespace, Labels, Completions, Type, Created. Details: metadata with pod
 * selector plus Desired completions / Parallelism / Active deadline, the "Job status" column, Containers and
 * Conditions; tabs Details, YAML, Pods, Events. Kind action: Edit parallelism.
 */
export const jobDescriptor: ResourceDescriptor<JobResource> = {
  model: JobModel,
  nav: { section: 'workloads', order: 80 },
  status: jobStatus,
  detailsTitle: 'Job status',
  summary: {
    podSelector: (job) => job.spec?.selector?.matchLabels,
    Extra: JobSummaryExtra,
  },
  DetailsSection: JobDetails,
  ExtraSections: JobSections,
  podsSelector: (job) => job.spec?.selector?.matchLabels,
  useKindActions: useJobActions,
  columns: [
    nameColumn(JobModel),
    namespaceColumn(JobModel),
    labelsColumn(JobModel),
    jobCompletionsColumn,
    {
      id: 'type',
      title: 'Type',
      cell: (job) => jobTypeAndCompletions(job).type,
      sortValue: (job) => jobTypeAndCompletions(job).type,
    },
    ageColumn(),
  ],
};
