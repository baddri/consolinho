import { Content, ContentVariants } from '@patternfly/react-core';
import { Link } from 'react-router';
import { useActiveCluster } from '@/features/cluster-context';
import { PodModel, type K8sResource, type Pod } from '@/shared/k8s';
import { Status } from '@/shared/ui';
import { resourcePath } from '../../paths';
import { CONTAINER_PARAM } from '../useSelectedContainer';
import { podStatus } from './podStatus';
import { PodStatusPopover } from './PodStatusPopover';

/** Props for {@link PodStatus}. */
export interface PodStatusProps {
  pod: Pod & K8sResource;
}

const IMAGE_PULL_STATUSES = ['ErrImagePull', 'ImagePullBackOff'];
const CREATE_CONTAINER_STATUSES = ['CreateContainerError', 'CreateContainerConfigError'];

/**
 * A pod's status as OCP `PodStatus` (`pod-list.tsx`): icon + text, or for the problem states OCP explains — Pending
 * while unschedulable, `CreateContainerError`/`CreateContainerConfigError`, `CrashLoopBackOff`, `ErrImagePull` and
 * `ImagePullBackOff` — a {@link PodStatusPopover} with the scheduler / waiting-container message and OCP's
 * troubleshooting copy and links. "View logs" opens the Logs tab on the waiting container. The links point into the
 * active cluster (URL); outside a cluster route the plain status shows. OCP's "Debug container" links are out of
 * scope (CP4a).
 */
export function PodStatus({ pod }: PodStatusProps) {
  const cluster = useActiveCluster();
  const status = podStatus(pod);
  if (cluster === undefined) return <Status status={status} />;

  const target = { namespace: pod.metadata.namespace, name: pod.metadata.name };
  const eventsLink = <Link to={resourcePath(cluster, PodModel, { ...target, tab: 'events' })}>View events</Link>;
  const unschedulable = pod.status?.conditions?.find(
    (condition) => condition.reason === 'Unschedulable' && condition.status === 'False',
  );
  if (status === 'Pending' && unschedulable) {
    return (
      <PodStatusPopover status={status} headerContent="Pod unschedulable" bodyContent={unschedulable.message ?? ''} />
    );
  }

  const waiting = pod.status?.containerStatuses?.find((container) => container.state?.waiting);
  if (!waiting) return <Status status={status} />;
  const message = waiting.state?.waiting?.message ?? '';

  if (CREATE_CONTAINER_STATUSES.includes(status)) {
    return (
      <PodStatusPopover
        status={status}
        headerContent="Couldn't create container"
        bodyContent={message}
        footerContent={
          <Content>
            <Content component={ContentVariants.p}>
              The container didn&apos;t start. Common causes include missing ConfigMaps, Secrets, or volume mounts, and
              invalid security contexts.
            </Content>
            <Content component={ContentVariants.p}>{eventsLink}</Content>
          </Content>
        }
      />
    );
  }
  if (status === 'CrashLoopBackOff') {
    const logsPath = resourcePath(cluster, PodModel, {
      ...target,
      tab: 'logs',
      search: { [CONTAINER_PARAM]: waiting.name },
    });
    return (
      <PodStatusPopover
        status={status}
        headerContent="Pod crash loop backoff"
        bodyContent={message}
        footerContent={
          <Content>
            <Content component={ContentVariants.p}>
              CrashLoopBackOff indicates that the application in the container is repeatedly failing to start.
            </Content>
            <Content component={ContentVariants.p}>
              To troubleshoot, view logs and events, or open a terminal session.
            </Content>
            <Content component={ContentVariants.p}>
              <Link to={logsPath}>View logs</Link>
              &emsp;
              {eventsLink}
            </Content>
          </Content>
        }
      />
    );
  }
  if (IMAGE_PULL_STATUSES.includes(status)) {
    // OCP: the waiting message only, no header or footer.
    return <PodStatusPopover status={status} bodyContent={message} />;
  }
  return <Status status={status} />;
}
