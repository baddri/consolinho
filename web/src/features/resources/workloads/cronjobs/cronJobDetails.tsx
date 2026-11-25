import { CronJobModel, JobModel, type CronJob, type K8sResource } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection, Timestamp } from '@/shared/ui';
import { useActionAccess } from '../../actions/useActionAccess';
import { ContainersTable } from '../../components/ContainersTable';
import type { KindActionArgs, KindActions, ResourceStatus } from '../../registry/types';
import { JobSpecItems, deadlineText } from '../jobs/jobDetails';
import { useStartJob } from './useStartJob';
import { suspendActionLabel, useToggleSuspend } from './useToggleSuspend';

/** A listed CronJob (`metadata` always present). */
export type CronJobResource = CronJob & K8sResource;

/** OCP `BooleanDisplay`: "True" / "False" (unset is False). */
export function booleanText(value: boolean | undefined): string {
  return value ? 'True' : 'False';
}

/** "Suspended" while `spec.suspend` is set, else no status (CJ-3). */
export function cronJobStatus(cronJob: CronJob): ResourceStatus | undefined {
  return cronJob.spec?.suspend ? { title: 'Suspended' } : undefined;
}

/**
 * Metadata-column rows after Annotations, OCP `CronJobDetails` `ResourceSummary` children: Schedule, Suspend,
 * Concurrency policy, Starting deadline seconds, Last schedule time.
 */
export function CronJobSummaryExtra({ obj }: { obj: CronJobResource }) {
  return (
    <>
      <DetailsItem label="Schedule" path="spec.schedule">{obj.spec?.schedule ?? '-'}</DetailsItem>
      <DetailsItem label="Suspend" path="spec.suspend">{booleanText(obj.spec?.suspend)}</DetailsItem>
      <DetailsItem label="Concurrency policy" path="spec.concurrencyPolicy">
        {obj.spec?.concurrencyPolicy ?? '-'}
      </DetailsItem>
      <DetailsItem label="Starting deadline seconds" path="spec.startingDeadlineSeconds">
        {deadlineText(obj.spec?.startingDeadlineSeconds)}
      </DetailsItem>
      <DetailsItem label="Last schedule time" path="status.lastScheduleTime">
        <Timestamp value={obj.status?.lastScheduleTime} />
      </DetailsItem>
    </>
  );
}

/** Right column of the Details tab, OCP `CronJobDetails` "Job details": the job template's completions settings. */
export function CronJobDetails({ obj }: { obj: CronJobResource }) {
  return <JobSpecItems spec={obj.spec?.jobTemplate.spec} />;
}

/** Section below the grid (OCP `CronJobDetails`): the job template's Containers. */
export function CronJobSections({ obj }: { obj: CronJobResource }) {
  return (
    <DetailsSubsection title="Containers">
      <ContainersTable containers={obj.spec?.jobTemplate.spec?.template.spec?.containers ?? []} />
    </DetailsSubsection>
  );
}

/**
 * The CronJob's own actions: "Start Job" (OCP `cronjob-provider.ts`; `create jobs` in the namespace) and the fleet's
 * "Suspend" / "Resume" (`patch cronjobs`, CJ-3). Both write at once, without a modal. The common items follow them.
 */
export function useCronJobActions({ cluster, obj, reviewByName, checkAccess }: KindActionArgs<CronJobResource>): KindActions {
  const { namespace } = obj.metadata;
  const name = obj.metadata.name ?? '';
  const createAccess = useActionAccess(cluster, { verb: 'create', model: JobModel, namespace }, reviewByName, checkAccess);
  const patchAccess = useActionAccess(
    cluster,
    { verb: 'patch', model: CronJobModel, namespace, name },
    reviewByName,
    checkAccess,
  );
  const suspended = obj.spec?.suspend === true;
  const startJob = useStartJob(cluster);
  const toggleSuspend = useToggleSuspend(cluster, suspended);

  return {
    items: [
      {
        itemKey: 'start-job',
        title: 'Start Job',
        onClick: () => {
          if (!createAccess.isAriaDisabled) startJob.mutate(obj);
        },
        ...createAccess,
      },
      {
        itemKey: 'toggle-suspend',
        title: suspendActionLabel(suspended),
        onClick: () => {
          if (!patchAccess.isAriaDisabled) toggleSuspend.mutate({ namespace, name, suspend: !suspended });
        },
        ...patchAccess,
      },
    ],
    dialog: null,
  };
}
