import { Bullseye, Spinner } from '@patternfly/react-core';
import { useCallback, useMemo } from 'react';
import type { K8sResource } from '@/shared/k8s';
import { ErrorState } from '@/shared/ui';
import { useResourceDataView } from '../../list/ResourceDataView';
import { podDescriptor } from '../../registry/kinds/pods';
import type { CronJobResource } from './cronJobDetails';
import { useOwnedJobs } from './useOwnedJobs';

/**
 * Pods tab of a CronJob (OCP `CronJobPodsComponent`, CJ-1): the Pods list — same columns, filters and row actions as
 * the Pods page — kept to pods controlled by one of the CronJob's Jobs. No label selector expresses that join, so the
 * Jobs are watched alongside and the pods filtered by owner uid. Rendered by the generic Pods tab (descriptor
 * `PodsTab`).
 */
export function CronJobPodsTab({ cluster, obj }: { cluster: string; obj: CronJobResource }) {
  const jobs = useOwnedJobs(cluster, obj);
  const jobUids = useMemo(() => new Set(jobs.data?.map((job) => job.metadata.uid)), [jobs.data]);
  const ownedByJob = useCallback(
    (pod: K8sResource) => pod.metadata.ownerReferences?.some((ref) => jobUids.has(ref.uid)) === true,
    [jobUids],
  );
  const { dataView } = useResourceDataView({
    descriptor: podDescriptor,
    cluster,
    scope: 'ns',
    namespace: obj.metadata.namespace,
    rowFilter: ownedByJob,
  });

  if (jobs.error) {
    return <ErrorState error={jobs.error} title="Could not load Jobs" onRetry={() => jobs.refetch()} />;
  }
  // Until the Jobs are known every pod would be filtered out: no "No Pods found" flash.
  if (jobs.data === undefined) {
    return (
      <Bullseye>
        <Spinner size="lg" aria-label="Loading Pods" />
      </Bullseye>
    );
  }
  return dataView;
}
