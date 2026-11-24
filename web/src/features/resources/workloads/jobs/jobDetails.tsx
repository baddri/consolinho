import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import { JobModel, type Job, type K8sResource } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection, Status, Timestamp } from '@/shared/ui';
import { ConditionsTable } from '../../components/ConditionsTable';
import { ContainersTable } from '../../components/ContainersTable';
import { resourcePath } from '../../paths';
import type { KindActionArgs, KindActions, ResourceStatus } from '../../registry/types';
import { useEditCountAction } from '../scale/useEditCountAction';

/** A listed Job (`metadata` always present). */
export type JobResource = Job & K8sResource;

/** The spec fields OCP's Job details read; a CronJob's `jobTemplate.spec` has the same shape. */
interface JobSpecFields {
  completions?: number;
  parallelism?: number;
  activeDeadlineSeconds?: number;
}

/** A Job's type and desired completions, as OCP `getJobTypeAndCompletions` (`public/module/k8s/job.ts`). */
export function jobTypeAndCompletions(job: Job): { type: string; completions: number } {
  const completions = job.spec?.completions;
  const parallelism = job.spec?.parallelism;
  if (!completions && !parallelism) return { type: 'Non-parallel', completions: 1 };
  if (completions && (!parallelism || parallelism === 1)) return { type: 'Non-parallel', completions };
  if (parallelism !== undefined && completions) return { type: 'Fixed completion count', completions };
  return { type: 'Work queue', completions: 1 };
}

/** "<succeeded> of <completions>", OCP's Completions cell. */
export function jobCompletionsText(job: Job): string {
  return `${String(job.status?.succeeded ?? 0)} of ${String(jobTypeAndCompletions(job).completions)}`;
}

/** OCP's Job status (`job.tsx` L139): the first condition's type (Complete, Failed, …), else "In progress". */
export function jobStatus(job: Job): ResourceStatus {
  return { title: job.status?.conditions?.[0]?.type ?? 'In progress' };
}

/** A count as text, "-" when absent (OCP `DetailsItem`'s default). */
function countText(value: number | undefined, fallback = '-'): string {
  return value === undefined ? fallback : String(value);
}

/** OCP's "Active/Starting deadline seconds" value: "<n> second(s)" or "Not configured". */
export function deadlineText(seconds: number | undefined): string {
  if (!seconds) return 'Not configured';
  return `${String(seconds)} ${seconds === 1 ? 'second' : 'seconds'}`;
}

/** OCP `Completions` (`job.tsx` L61): the completions text as a link to the Job's Pods tab. */
export function JobCompletionsLink({ obj }: { obj: JobResource }) {
  const cluster = useActiveCluster();
  const text = jobCompletionsText(obj);
  const { namespace, name } = obj.metadata;
  if (cluster === undefined || name === undefined) return <>{text}</>;
  return <Link to={resourcePath(cluster, JobModel, { namespace, name, tab: 'pods' })}>{text}</Link>;
}

/**
 * Desired completions, Parallelism and Active deadline seconds of a Job spec — OCP puts them after Annotations in a
 * Job's `ResourceSummary` and in the right column of a CronJob (its `jobTemplate.spec`).
 */
export function JobSpecItems({ spec }: { spec: JobSpecFields | undefined }) {
  return (
    <>
      <DetailsItem label="Desired completions" path="spec.completions">
        {countText(spec?.completions)}
      </DetailsItem>
      <DetailsItem label="Parallelism" path="spec.parallelism">{countText(spec?.parallelism)}</DetailsItem>
      <DetailsItem label="Active deadline seconds" path="spec.activeDeadlineSeconds">
        {deadlineText(spec?.activeDeadlineSeconds)}
      </DetailsItem>
    </>
  );
}

/** Metadata-column rows after Annotations (OCP `JobDetails` `ResourceSummary` children). */
export function JobSummaryExtra({ obj }: { obj: JobResource }) {
  return <JobSpecItems spec={obj.spec} />;
}

/**
 * Right column of the Details tab, OCP `JobDetails` "Job status": Status, Start / Completion time and the Succeeded,
 * Active and Failed pod counts (0 when unset).
 */
export function JobDetails({ obj }: { obj: JobResource }) {
  const status = obj.status;
  return (
    <>
      <DetailsItem label="Status">
        <Status status={jobStatus(obj).title} />
      </DetailsItem>
      <DetailsItem label="Start time" path="status.startTime">
        <Timestamp value={status?.startTime} />
      </DetailsItem>
      <DetailsItem label="Completion time" path="status.completionTime">
        <Timestamp value={status?.completionTime} />
      </DetailsItem>
      <DetailsItem label="Succeeded pods" path="status.succeeded">
        {countText(status?.succeeded, '0')}
      </DetailsItem>
      <DetailsItem label="Active pods" path="status.active">{countText(status?.active, '0')}</DetailsItem>
      <DetailsItem label="Failed pods" path="status.failed">{countText(status?.failed, '0')}</DetailsItem>
    </>
  );
}

/** Sections below the grid (OCP `JobDetails`): Containers, Conditions. */
export function JobSections({ obj }: { obj: JobResource }) {
  return (
    <>
      <DetailsSubsection title="Containers">
        <ContainersTable containers={obj.spec?.template.spec?.containers ?? []} />
      </DetailsSubsection>
      <DetailsSubsection title="Conditions">
        <ConditionsTable conditions={obj.status?.conditions} />
      </DetailsSubsection>
    </>
  );
}

/**
 * The Job's own actions (OCP `job-provider.ts` / `useJobActions.ts`): "Edit parallelism" (`patch jobs`, JSON Patch
 * `replace /spec/parallelism` through the shared count modal). The common Edit / Delete items follow it.
 */
export function useJobActions(args: KindActionArgs<JobResource>): KindActions {
  const editParallelism = useEditCountAction(args, JobModel, { field: 'parallelism' });
  return {
    items: editParallelism.item ? [editParallelism.item] : [],
    dialog: editParallelism.dialog,
  };
}
