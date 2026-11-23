import { useMemo } from 'react';
import { JobModel, useK8sList, type CronJob, type K8sResource } from '@/shared/k8s';

/**
 * The live Jobs in `cronJob`'s namespace that it owns (`ownerReferences[].uid`, the join OCP `CronJobPodsComponent`
 * does). `data` stays `undefined` until the Jobs list has loaded.
 */
export function useOwnedJobs(cluster: string, cronJob: CronJob & K8sResource) {
  const jobs = useK8sList<K8sResource>(cluster, JobModel, { namespace: cronJob.metadata.namespace });
  const uid = cronJob.metadata.uid;
  const data = useMemo(
    () => jobs.data?.filter((job) => job.metadata.ownerReferences?.some((ref) => ref.uid === uid)),
    [jobs.data, uid],
  );
  return { ...jobs, data };
}
