import { NodeModel } from '@/shared/k8s';
import { LOW_PRIORITY_COLUMN } from '@/shared/table';
import { DASH } from '@/shared/ui';
import { NodeSections, type NodeResource } from '../../compute/nodes/NodeDetails';
import { NodeDetailsOverview } from '../../compute/nodes/NodeDetailsOverview';
import { NodePodsTab } from '../../compute/nodes/NodePodsTab';
import { NodeStatus } from '../../compute/nodes/NodeStatus';
import {
  NODE_FILTER_ROLES,
  NODE_STATUSES,
  nodeArchitecture,
  nodeInstanceType,
  nodeRoles,
  nodeStatusText,
  nodeZone,
} from '../../compute/nodes/node';
import { useNodeActions } from '../../compute/nodes/useNodeActions';
import { ageColumn, nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

export type { NodeResource };

/**
 * Nodes (NODE-1..3, OCP `NodesPage` / `NodeDetailsPage`), cluster-scoped: Name, Status (Ready / Not Ready, as OCP
 * `nodeStatus`, plus "Scheduling disabled"), Roles, Instance type, Zone, Architecture, Created; Status and Roles filters. OCP's
 * Memory / CPU / Filesystem / Pods columns need Prometheus and are omitted (spec Q6). Details: OCP's own
 * `NodeDetailsOverview` grid (`DetailsOverview`), then Node conditions and Capacity and allocatable. Pods tab: every pod
 * on the node with its owner, the drain view (NODE-4); kind actions Mark as (un)schedulable (NODE-5), before the
 * common ones.
 */
export const nodeDescriptor: ResourceDescriptor<NodeResource> = {
  model: NodeModel,
  nav: { section: 'compute', order: 10 },
  status: (node) => ({ title: nodeStatusText(node) }),
  DetailsOverview: NodeDetailsOverview,
  ExtraSections: NodeSections,
  PodsTab: NodePodsTab,
  useKindActions: useNodeActions,
  columns: [
    nameColumn(NodeModel),
    {
      id: 'status',
      title: 'Status',
      cell: (node) => <NodeStatus node={node} />,
      sortValue: nodeStatusText,
    },
    {
      id: 'roles',
      title: 'Roles',
      cell: (node) => nodeRoles(node).join(', ') || DASH,
      sortValue: (node) => nodeRoles(node).join(', ') || null,
    },
    {
      id: 'instanceType',
      title: 'Instance type',
      visibility: LOW_PRIORITY_COLUMN,
      cell: (node) => nodeInstanceType(node) ?? DASH,
      sortValue: (node) => nodeInstanceType(node) ?? null,
    },
    {
      id: 'zone',
      title: 'Zone',
      cell: (node) => nodeZone(node) ?? DASH,
      sortValue: (node) => nodeZone(node) ?? null,
    },
    {
      id: 'architecture',
      title: 'Architecture',
      visibility: LOW_PRIORITY_COLUMN,
      cell: (node) => nodeArchitecture(node) ?? DASH,
      sortValue: (node) => nodeArchitecture(node) ?? null,
    },
    ageColumn(),
  ],
  filters: [
    {
      id: 'status',
      title: 'Status',
      options: NODE_STATUSES.map((value) => ({ value, label: value })),
      matches: (node, values) => values.includes(nodeStatusText(node)),
    },
    {
      id: 'roles',
      title: 'Roles',
      options: NODE_FILTER_ROLES.map((value) => ({ value, label: value })),
      matches: (node, values) => nodeRoles(node).some((role) => values.includes(role)),
    },
  ],
};
