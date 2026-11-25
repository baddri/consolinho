import { List, ListItem } from '@patternfly/react-core';
import { MachineModel, NodeModel, type Node } from '@/shared/k8s';
import {
  DASH,
  DetailsColumn,
  DetailsGrid,
  DetailsItem,
  InlineEditButton,
  kindLabelColor,
  ResourceLabels,
  Timestamp,
} from '@/shared/ui';
import { ResourceLink } from '../../components/ResourceLink';
import { useResourceDetails } from '../../details/detailsContext';
import { useMetadataEdit } from '../../details/useMetadataEdit';
import { ALL_NAMESPACES } from '../../paths';
import { searchPath } from '../../search/searchPath';
import type { NodeResource } from './NodeDetails';
import { nodeAddresses, nodeArchitecture, nodeMachine, nodeProvider, nodeUptime } from './node';
import { NodeStatus } from './NodeStatus';

/** `1 Taint` / `2 Annotations`: OCP's count copy (`{{count}} Taint`, capitalized noun). */
function countText(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** `linux` → `Linux` (OCP renders the operating system and Unschedulable with `text-capitalize`). */
function capitalize(value: string | undefined): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : DASH;
}

/** Node addresses as OCP `NodeIPList` (expanded): one `Type: address` line each, the type in subtle text. */
function NodeIPList({ node }: { node: Node }) {
  const addresses = nodeAddresses(node);
  if (addresses.length === 0) return DASH;
  return (
    <List isPlain>
      {addresses.map(({ type, address }) => (
        <ListItem key={`${type}/${address}`}>
          <span className="pf-v6-u-text-color-subtle">{type}: </span>
          {address}
        </ListItem>
      ))}
    </List>
  );
}

/**
 * Left column of the node overview, in OCP `NodeDetailsOverview` order: Node name, Status, External ID, Uptime (when
 * the node last turned Ready), Node addresses, Labels, Taints, Annotations, Machine (only when the
 * `machine.openshift.io/machine` annotation names one), Provider ID, Unschedulable (only when `spec.unschedulable` is
 * set) and Created. Labels and Annotations get the shared metadata edit affordances with `patch` access; Taints stay
 * a plain count (no taints modal, NODE is read-only).
 */
function NodeOverviewLeft({ obj }: { obj: NodeResource }) {
  const { cluster } = useResourceDetails();
  const edit = useMetadataEdit(cluster, NodeModel, obj);
  const { name, labels = {}, annotations = {}, creationTimestamp } = obj.metadata;
  const machine = nodeMachine(obj);
  const uptime = nodeUptime(obj);
  const unschedulable = obj.spec?.unschedulable;
  const annotationCount = countText(Object.keys(annotations).length, 'Annotation');
  return (
    <>
      <DetailsItem label="Node name" path="metadata.name">
        {name}
      </DetailsItem>
      <DetailsItem label="Status">
        <NodeStatus node={obj} />
      </DetailsItem>
      <DetailsItem label="External ID" path="spec.externalID">
        {obj.spec?.externalID ?? DASH}
      </DetailsItem>
      <DetailsItem label="Uptime">{uptime ? <Timestamp value={uptime} /> : DASH}</DetailsItem>
      <DetailsItem label="Node addresses" path="status.addresses">
        <NodeIPList node={obj} />
      </DetailsItem>
      <DetailsItem label="Labels" path="metadata.labels" onEdit={edit.canEdit ? edit.openLabels : undefined}>
        <ResourceLabels
          isBoxed={edit.canEdit}
          labels={labels}
          color={kindLabelColor(NodeModel.kind)}
          linkTo={(key, value) =>
            searchPath(cluster, {
              namespace: ALL_NAMESPACES,
              kinds: [NodeModel],
              labels: [`${key}=${value}`],
            })
          }
        />
      </DetailsItem>
      <DetailsItem label="Taints" path="spec.taints">
        {countText(obj.spec?.taints?.length ?? 0, 'Taint')}
      </DetailsItem>
      <DetailsItem label="Annotations" path="metadata.annotations">
        {edit.canEdit ? (
          <InlineEditButton onClick={edit.openAnnotations}>{annotationCount}</InlineEditButton>
        ) : (
          annotationCount
        )}
      </DetailsItem>
      {machine && (
        <DetailsItem label="Machine">
          <ResourceLink model={MachineModel} name={machine.name} namespace={machine.namespace} />
        </DetailsItem>
      )}
      <DetailsItem label="Provider ID" path="spec.providerID">
        {nodeProvider(obj) ?? DASH}
      </DetailsItem>
      {unschedulable !== undefined && (
        <DetailsItem label="Unschedulable" path="spec.unschedulable">
          {capitalize(String(unschedulable))}
        </DetailsItem>
      )}
      <DetailsItem label="Created" path="metadata.creationTimestamp">
        <Timestamp value={creationTimestamp} />
      </DetailsItem>
      {edit.dialog}
    </>
  );
}

/** Right column of the node overview: the kubelet's `status.nodeInfo`, in OCP `NodeDetailsOverview` order. */
function NodeOverviewRight({ obj }: { obj: NodeResource }) {
  const info = obj.status?.nodeInfo;
  return (
    <>
      <DetailsItem label="Operating system" path="status.nodeInfo.operatingSystem">
        {capitalize(info?.operatingSystem)}
      </DetailsItem>
      <DetailsItem label="OS image" path="status.nodeInfo.osImage">
        {info?.osImage ?? DASH}
      </DetailsItem>
      <DetailsItem label="Architecture" path="status.nodeInfo.architecture">
        {nodeArchitecture(obj) ?? DASH}
      </DetailsItem>
      <DetailsItem label="Kernel version" path="status.nodeInfo.kernelVersion">
        {info?.kernelVersion ?? DASH}
      </DetailsItem>
      <DetailsItem label="Boot ID" path="status.nodeInfo.bootID">
        {info?.bootID ?? DASH}
      </DetailsItem>
      <DetailsItem label="Container runtime" path="status.nodeInfo.containerRuntimeVersion">
        {info?.containerRuntimeVersion ?? DASH}
      </DetailsItem>
      <DetailsItem label="Kubelet version" path="status.nodeInfo.kubeletVersion">
        {info?.kubeletVersion ?? DASH}
      </DetailsItem>
      <DetailsItem label="Kube-proxy version" path="status.nodeInfo.kubeProxyVersion">
        {info?.kubeProxyVersion ?? DASH}
      </DetailsItem>
    </>
  );
}

/**
 * The Node "Node details" grid (NODE-3, OCP `NodeDetailsOverview`), the descriptor's `DetailsOverview`: OCP
 * interleaves metadata with node fields (no Owner, "Node name", "Created"), so it replaces the shared metadata column.
 */
export function NodeDetailsOverview({ obj }: { obj: NodeResource }) {
  return (
    <DetailsGrid>
      <DetailsColumn aria-label="Metadata">
        <NodeOverviewLeft obj={obj} />
      </DetailsColumn>
      <DetailsColumn aria-label="Node properties">
        <NodeOverviewRight obj={obj} />
      </DetailsColumn>
    </DetailsGrid>
  );
}
