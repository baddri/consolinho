import {
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { useId } from 'react';
import { ReplicationControllerModel } from '@/shared/k8s';
import { ClusterContextText } from '../../actions/ClusterContextText';
import { mutationErrorMessage } from '../../actions/useResourceMutation';
import type { ReplicationControllerResource } from './replicationControllerDetails';
import { useCancelRollout } from './useCancelRollout';

/** Props for {@link CancelRolloutModal}. */
export interface CancelRolloutModalProps {
  cluster: string;
  replicationController: ReplicationControllerResource;
  onClose: () => void;
}

/**
 * OCP's "Cancel rollout" warning modal (`useWarningModal` in `useReplicationControllerActions`): small, warning
 * title icon, "Are you sure you want to cancel this rollout?", primary "Yes, cancel" and link "No, don't cancel".
 * Fleet addition (SAFE-1): the {@link ClusterContextText} line naming the RC, namespace and cluster with its
 * environment label. Unlike OCP it stays open while the patch runs and shows a failure inline; success closes it.
 */
export function CancelRolloutModal({ cluster, replicationController, onClose }: CancelRolloutModalProps) {
  const titleId = useId();
  const bodyId = useId();
  const mutation = useCancelRollout(cluster);
  const { namespace, name = '' } = replicationController.metadata;
  const confirm = () => {
    if (!mutation.isPending) mutation.mutate({ namespace, name }, { onSuccess: onClose });
  };

  return (
    <Modal variant="small" isOpen onClose={onClose} aria-labelledby={titleId} aria-describedby={bodyId}>
      <ModalHeader title="Cancel rollout" titleIconVariant="warning" labelId={titleId} />
      <ModalBody id={bodyId}>
        <Stack hasGutter>
          <StackItem>
            <ClusterContextText
              cluster={cluster}
              kindLabel={ReplicationControllerModel.label}
              objectName={name}
              namespace={namespace}
            />
          </StackItem>
          <StackItem>Are you sure you want to cancel this rollout?</StackItem>
          {mutation.error !== null && (
            <StackItem>
              <Alert isInline variant="danger" title="An error occurred" isLiveRegion>
                {mutationErrorMessage(mutation.error)}
              </Alert>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        {/* Buttons sit directly in the footer like OCP `WarningModal`; PF spaces them. */}
        <Button
          variant="primary"
          onClick={confirm}
          isAriaDisabled={mutation.isPending}
          isLoading={mutation.isPending}
        >
          Yes, cancel
        </Button>
        <Button variant="link" onClick={onClose}>
          No, don&apos;t cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
