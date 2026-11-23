import { useCallback } from 'react';
import type { K8sResource } from '@/shared/k8s';
import { useResourceDetails } from '../../details/detailsContext';
import { useResourceDataView } from '../../list/ResourceDataView';
import { jobDescriptor, type JobResource } from '../../registry/kinds/jobs';
import type { ResourceDescriptor } from '../../registry/types';

/**
 * The Job kind as this tab shows it: the Jobs page's columns, model and row actions (OCP `JobsList`, `job.tsx`
 * L52-58), newest first.
 */
const cronJobJobsDescriptor: ResourceDescriptor<JobResource> = {
  ...jobDescriptor,
  defaultSort: { columnId: 'created', direction: 'desc' },
};

/**
 * Jobs tab of a CronJob (OCP `CronJobJobsComponent`, CJ-1): the Jobs in its namespace that it owns
 * (`ownerReferences[].uid`), newest first. Lazy route module; the details layout renders the labelled tabpanel.
 */
export function CronJobJobsTab() {
  const { cluster, obj } = useResourceDetails();
  const uid = obj.metadata.uid;
  const ownedByCronJob = useCallback(
    (job: K8sResource) => job.metadata.ownerReferences?.some((ref) => ref.uid === uid) === true,
    [uid],
  );
  const { dataView } = useResourceDataView({
    descriptor: cronJobJobsDescriptor,
    cluster,
    scope: 'ns',
    namespace: obj.metadata.namespace,
    rowFilter: ownedByCronJob,
  });
  return dataView;
}
