import { Content } from '@patternfly/react-core';
import { NodeModel } from '@/shared/k8s';
import { ResourceMutationModal } from '../../actions/ResourceMutationModal';
import type { NodeResource } from './NodeDetails';
import { useNodeScheduling } from './useNodeScheduling';

/** OCP `ConfigureUnschedulableModal` body (single node), verbatim. */
export const UNSCHEDULABLE_BODY =
  "Unschedulable nodes won't accept new pods. By blocking new pod assignments, you can isolate a node to perform maintenance or decommission it without disrupting new traffic.";

/**
 * Confirms cordoning a node (NODE-5, OCP `ConfigureUnschedulableModal`): title, the cluster context line (SAFE5-1),
 * OCP's explanation and a "Mark unschedulable" primary. Closes on success (the toast names node and cluster); a failure
 * such as a read-only grant's 403 stays inline.
 */
export function MarkUnschedulableModal({
  cluster,
  node,
  onClose,
}: {
  cluster: string;
  node: NodeResource;
  onClose: () => void;
}) {
  const mutation = useNodeScheduling(cluster);
  const name = node.metadata.name ?? '';
  return (
    <ResourceMutationModal
      title="Mark as unschedulable"
      cluster={cluster}
      namespace={undefined}
      objectName={name}
      kindLabel={NodeModel.label}
      isSaving={mutation.isPending}
      error={mutation.error}
      saveLabel="Mark unschedulable"
      intro={<Content component="p">{UNSCHEDULABLE_BODY}</Content>}
      onSave={() =>
        mutation.mutate(
          { namespace: undefined, name, unschedulable: true, hasKey: node.spec?.unschedulable !== undefined },
          { onSuccess: onClose },
        )
      }
      onClose={onClose}
    >
      {null}
    </ResourceMutationModal>
  );
}
