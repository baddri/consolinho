import { ReplicationControllerModel } from '@/shared/k8s';
import type { KindActionArgs, KindActions } from '../../registry/types';
import { useEditCountAction } from '../scale/useEditCountAction';
import type { ReplicationControllerResource } from './replicationControllerDetails';

/**
 * The ReplicationController's own actions (ADR-0037 §3, OCP `replication-controllers-provider.ts`): "Edit Pod count"
 * (`patch replicationcontrollers/scale`; hidden under an HPA). The common Edit / Delete items follow them.
 *
 * Extension point for T-0193: OCP also lists "Cancel rollout" (phase New/Pending/Running) and "Rollback" (a
 * scaled-down RC owned by a DeploymentConfig) for DC-owned RCs; add them here, after Edit Pod count.
 */
export function useReplicationControllerActions(args: KindActionArgs<ReplicationControllerResource>): KindActions {
  const editCount = useEditCountAction(args, ReplicationControllerModel);
  return { items: editCount.item ? [editCount.item] : [], dialog: editCount.dialog };
}
