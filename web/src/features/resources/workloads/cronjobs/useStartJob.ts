import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { JobModel, k8sCreate, type CronJob, type Job, type K8sResource } from '@/shared/k8s';
import { useToast } from '@/shared/ui';
import { mutationErrorMessage } from '../../actions/useResourceMutation';
import { resourcePath } from '../../paths';

/** Annotation `kubectl create job --from=cronjob/…` puts on a manually started Job. */
export const INSTANTIATE_ANNOTATION = 'cronjob.kubernetes.io/instantiate';

/** Longest Job name its pods can still carry in the `job-name` label. */
const MAX_NAME_LENGTH = 63;

/**
 * The Job "Start Job" creates from `cronJob` (OCP `useCronJobActions.ts` `startJob`, plus kubectl's annotation):
 * `<name>-<unix seconds>` (the CronJob name is shortened so the result fits 63 characters and keeps its timestamp), the
 * CronJob's annotations plus `instantiate: manual`, the job template's labels and spec, and a controller owner
 * reference so the CronJob's Jobs tab, history limits and cascading delete see it.
 */
export function startJobPayload(cronJob: CronJob & K8sResource, nowMs = Date.now()): Job {
  const suffix = String(Math.floor(nowMs / 1000));
  const name = cronJob.metadata.name ?? '';
  const jobTemplate = cronJob.spec?.jobTemplate;
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: `${name.slice(0, MAX_NAME_LENGTH - suffix.length - 1)}-${suffix}`,
      namespace: cronJob.metadata.namespace,
      annotations: { ...cronJob.metadata.annotations, [INSTANTIATE_ANNOTATION]: 'manual' },
      ...(jobTemplate?.metadata?.labels ? { labels: jobTemplate.metadata.labels } : {}),
      ownerReferences: [
        {
          apiVersion: 'batch/v1',
          kind: 'CronJob',
          name,
          uid: cronJob.metadata.uid ?? '',
          controller: true,
          blockOwnerDeletion: true,
        },
      ],
    },
    spec: jobTemplate?.spec,
  };
}

/**
 * "Start Job" (CJ-2): POSTs {@link startJobPayload} and, as OCP, lands on the new Job's details without a success
 * toast; a failure toasts the warning "Failed to start a Job." with the server's message.
 */
export function useStartJob(cluster: string) {
  const navigate = useNavigate();
  const toast = useToast();
  return useMutation<Job, unknown, CronJob & K8sResource>({
    mutationFn: (cronJob) =>
      k8sCreate(cluster, JobModel, cronJob.metadata.namespace, startJobPayload(cronJob)),
    onSuccess: (job) => {
      void navigate(
        resourcePath(cluster, JobModel, { namespace: job.metadata?.namespace, name: job.metadata?.name }),
      );
    },
    onError: (error) => toast.warning('Failed to start a Job.', mutationErrorMessage(error)),
  });
}
