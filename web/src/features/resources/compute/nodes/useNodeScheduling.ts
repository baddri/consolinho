import { k8sPatch, NodeModel, type JsonPatchOp, type Node } from '@/shared/k8s';
import { useResourceMutation, type MutationTarget } from '../../actions/useResourceMutation';

/**
 * What {@link useNodeScheduling} writes: cordon (with whether the node already has a `spec.unschedulable` key,
 * `replace` vs `add` as OCP `makeNodeUnschedulable`) or uncordon (removes the key).
 */
export type NodeSchedulingVars = MutationTarget &
  ({ unschedulable: true; hasKey: boolean } | { unschedulable: false });

/** Whether the node is cordoned (`spec.unschedulable`, OCP `isNodeUnschedulable`). */
export function isNodeUnschedulable(node: Node): boolean {
  return node.spec?.unschedulable === true;
}

/**
 * The JSON Patch of a (un)cordon (ADR-0037 §4): `add`/`replace /spec/unschedulable: true` to cordon, `remove` it to
 * uncordon (the key only exists while cordoned, so the remove never misses).
 */
export function schedulingPatch(vars: NodeSchedulingVars): JsonPatchOp[] {
  return vars.unschedulable
    ? [{ op: vars.hasKey ? 'replace' : 'add', path: '/spec/unschedulable', value: true }]
    : [{ op: 'remove', path: '/spec/unschedulable' }];
}

/**
 * Marks a node unschedulable or schedulable (OCP `nodeSchedulingActions.ts`), toasting "<node> marked as
 * (un)schedulable on <cluster>". `toastErrors` is for the modal-less "Mark as schedulable"; the modal renders its
 * failure inline instead.
 */
export function useNodeScheduling(cluster: string, { toastErrors }: { toastErrors?: { action: string } } = {}) {
  return useResourceMutation(cluster, {
    model: NodeModel,
    mutationFn: (vars: NodeSchedulingVars) => k8sPatch(cluster, NodeModel, { name: vars.name }, schedulingPatch(vars)),
    successMessage: ({ name, unschedulable }) =>
      `${name} marked as ${unschedulable ? 'unschedulable' : 'schedulable'}`,
    toastErrors,
  });
}
