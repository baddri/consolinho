import { NodeModel, type K8sResource, type Node } from '@/shared/k8s';
import { ageColumn, nameColumn } from '../columns';
import type { ResourceDescriptor } from '../types';

/** A listed Node (`metadata` always present). */
export type NodeResource = Node & K8sResource;

/**
 * Nodes (Compute → Nodes, OCP `node.tsx`), cluster-scoped. Minimal CP5b foundation descriptor (T-0331): Name and
 * Created only; columns, status, details, Pods tab and actions are filled in by T-0332/T-0333.
 */
export const nodeDescriptor: ResourceDescriptor<NodeResource> = {
  model: NodeModel,
  nav: { section: 'compute', order: 10 },
  columns: [nameColumn(NodeModel), ageColumn()],
};
