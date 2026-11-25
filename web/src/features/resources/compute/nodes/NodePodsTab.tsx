import { Button, Content, Popover } from '@patternfly/react-core';
import { useMemo } from 'react';
import type { OwnerReference, Pod } from '@/shared/k8s';
import { StatusIconText } from '@/shared/ui';
import { ObjectReferenceLink } from '../../components/ObjectReferenceLink';
import { useResourceDataView } from '../../list/ResourceDataView';
import { podColumns, podDescriptor, type PodResource } from '../../registry/kinds/pods';
import type { ResourceDescriptor } from '../../registry/types';
import type { NodeResource } from './NodeDetails';

/** Popover body of a bare pod's Owner cell *(fleet)*: drain deletes such pods for good. */
export const BARE_POD_POPOVER =
  'This pod is not managed by a controller. Draining the node deletes it and nothing recreates it.';

/** What the drain helpers read of a pod: its metadata (a listed `K8sResource` or a `Pod`). */
type PodMeta = Pick<Pod, 'metadata'>;

/** The pod's controller (`ownerReferences[].controller`), what `oc adm drain` checks. */
export function podController(pod: PodMeta): OwnerReference | undefined {
  return pod.metadata?.ownerReferences?.find((ref) => ref.controller === true);
}

/** Whether a DaemonSet controls the pod (drain skips those with `--ignore-daemonsets`). */
export function isDaemonSetPod(pod: PodMeta): boolean {
  return podController(pod)?.kind === 'DaemonSet';
}

/**
 * Owner: the controller as a kind-badge link, or for a bare pod *(fleet)* OCP's `PopoverStatus` pattern (as
 * `PodStatusPopover`): a warning "No owner" inline link button opening a popover on the right that explains drain.
 */
function NodePodOwner({ pod }: { pod: PodResource }) {
  const owner = podController(pod);
  if (!owner) {
    return (
      <Popover position="right" headerContent="No owner" bodyContent={BARE_POD_POPOVER}>
        <Button variant="link" isInline data-test="popover-status-button">
          <StatusIconText status="warning" text="No owner" />
        </Button>
      </Popover>
    );
  }
  return (
    <ObjectReferenceLink
      apiVersion={owner.apiVersion}
      kind={owner.kind}
      name={owner.name}
      namespace={pod.metadata.namespace}
    />
  );
}

/** Value of the Owner filter's one option. */
const EXCLUDE_DAEMONSET = 'exclude-daemonset';

/**
 * The Pods descriptor of the node's Pods tab: the Pods list columns (Namespace shown, as the tab lists all
 * namespaces) with the controller-only Owner cell at OCP's pod-list breakpoint (≥ lg; its all-projects 2xl dropped),
 * and after Status the *(fleet)* Owner filter "Exclude DaemonSet pods". Built in the component (memoised), not at
 * import: the registry imports this module while `pods.tsx` may still be initialising.
 */
function nodePodsDescriptor(): ResourceDescriptor<PodResource> {
  const columns = podColumns({ showNodes: false }).map((column) =>
    column.id === 'owner'
      ? {
          ...column,
          allNamespacesVisibility: undefined,
          cell: (pod: PodResource) => <NodePodOwner pod={pod} />,
        }
      : column,
  );
  return {
    ...podDescriptor,
    columns,
    filters: [
      ...(podDescriptor.filters ?? []),
      {
        id: 'owner',
        title: 'Owner',
        options: [{ value: EXCLUDE_DAEMONSET, label: 'Exclude DaemonSet pods' }],
        matches: (pod) => !isDaemonSetPod(pod),
      },
    ],
  };
}

/** "N pods (M not managed by a DaemonSet)" *(fleet)*, the drain view's summary. */
export function nodePodsCountText(pods: PodMeta[]): string {
  const others = pods.filter((pod) => !isDaemonSetPod(pod)).length;
  return `${String(pods.length)} ${pods.length === 1 ? 'pod' : 'pods'} (${String(others)} not managed by a DaemonSet)`;
}

/**
 * Pods tab of a Node (NODE-4, OCP `NodeWorkload` `NodePodsPage`: `PodsPage` with `fieldSelector=spec.nodeName=<name>`
 * across all namespaces): the live Pods list with Namespace, the controller as Owner and Pod row actions. The drain
 * view *(fleet)*: a count line of the pods drain would evict, an "Exclude DaemonSet pods" filter and a warning on bare
 * pods. No drain or evict (spec Q2).
 */
export function NodePodsTab({ cluster, obj }: { cluster: string; obj: NodeResource }) {
  const descriptor = useMemo(() => nodePodsDescriptor(), []);
  const { data, dataView } = useResourceDataView({
    descriptor,
    cluster,
    scope: 'all',
    namespace: undefined,
    id: 'node-pods',
    fieldSelector: `spec.nodeName=${obj.metadata.name ?? ''}`,
  });
  return (
    <>
      {data !== undefined && data.length > 0 && <Content component="p">{nodePodsCountText(data)}</Content>}
      {dataView}
    </>
  );
}
