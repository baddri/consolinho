import { useState } from 'react';
import { NodeModel } from '@/shared/k8s';
import { useActionAccess } from '../../actions/useActionAccess';
import type { KindActionArgs, KindActions } from '../../registry/types';
import { MarkUnschedulableModal } from './MarkUnschedulableModal';
import type { NodeResource } from './NodeDetails';
import { isNodeUnschedulable, useNodeScheduling } from './useNodeScheduling';

/**
 * The Node's own actions (NODE-5, OCP `menu-actions.tsx` `useNodeActions`): exactly one of "Mark as schedulable"
 * (while cordoned; writes at once, as OCP, failures toast) and "Mark as unschedulable" (opens
 * {@link MarkUnschedulableModal}). Both need `patch nodes` and are disabled with the reason otherwise (SAFE5). No
 * drain or evict (spec Q2).
 */
export function useNodeActions({ cluster, obj, reviewByName }: KindActionArgs<NodeResource>): KindActions {
  const name = obj.metadata.name ?? '';
  const access = useActionAccess(cluster, { verb: 'patch', model: NodeModel, name }, reviewByName);
  const schedule = useNodeScheduling(cluster, { toastErrors: { action: 'Mark as schedulable' } });
  const [modalOpen, setModalOpen] = useState(false);
  const unschedulable = isNodeUnschedulable(obj);

  const item = unschedulable
    ? {
        itemKey: 'mark-as-schedulable',
        title: 'Mark as schedulable',
        onClick: () => {
          if (!access.isAriaDisabled)
            schedule.mutate({ namespace: undefined, name, unschedulable: false });
        },
        ...access,
      }
    : {
        itemKey: 'mark-as-unschedulable',
        title: 'Mark as unschedulable',
        onClick: () => {
          if (!access.isAriaDisabled) setModalOpen(true);
        },
        ...access,
      };

  return {
    items: [item],
    dialog: modalOpen ? (
      <MarkUnschedulableModal cluster={cluster} node={obj} onClose={() => setModalOpen(false)} />
    ) : null,
  };
}
