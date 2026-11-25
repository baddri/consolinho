import { isUnschedulable } from '@/shared/health';
import type { Node } from '@/shared/k8s';
import { Status } from '@/shared/ui';
import { nodeStatusText } from './node';

/**
 * A node's status as OCP `NodeStatus.tsx`: Ready / Not Ready / Unknown with its icon, then OCP's `SecondaryStatus`
 * line "Scheduling disabled" (small subtle text, `SchedulableStatus.tsx` title) while the node is cordoned. OCP wraps
 * the main status in a popover with "Mark as schedulable"; that action arrives with T-0333.
 */
export function NodeStatus({ node }: { node: Node }) {
  return (
    <>
      <Status status={nodeStatusText(node)} />
      {isUnschedulable(node) && (
        <div>
          <span className="pf-v6-u-font-size-xs pf-v6-u-text-color-subtle">Scheduling disabled</span>
        </div>
      )}
    </>
  );
}
