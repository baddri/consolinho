import {
  Alert,
  Button,
  Flex,
  Form,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@patternfly/react-core';
import { useId, type ReactNode, type SyntheticEvent } from 'react';
import { ClusterContextText } from './ClusterContextText';
import { mutationErrorMessage } from './useResourceMutation';

/** Props for {@link ResourceMutationModal}. */
export interface ResourceMutationModalProps {
  title: string;
  cluster: string;
  /** Omitted for cluster-scoped objects. */
  namespace: string | undefined;
  objectName: string;
  /** E.g. "Deployment"; shown in the cluster context line. */
  kindLabel: string;
  isSaving: boolean;
  /** The failed save, rendered inline with the server's message; `null`/`undefined` when none. */
  error: unknown;
  onSave: () => void;
  onClose: () => void;
  saveLabel?: string;
  /** The form fields. */
  children: ReactNode;
}

/**
 * The shell of every resource-action modal (ADR-0037 §4, SAFE-1), as OCP's small action modals: title, the
 * {@link ClusterContextText} line naming object, namespace and cluster (display name + environment label), the
 * fields, an inline danger alert with the server's message on failure (OCP `ErrorMessage`, "An error occurred"), and
 * a primary Save / link Cancel footer. The body is a form, so Enter in a field saves.
 */
export function ResourceMutationModal({
  title,
  cluster,
  namespace,
  objectName,
  kindLabel,
  isSaving,
  error,
  onSave,
  onClose,
  saveLabel = 'Save',
  children,
}: ResourceMutationModalProps) {
  const titleId = useId();
  const formId = useId();
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!isSaving) onSave();
  };

  return (
    <Modal variant="small" isOpen onClose={onClose} aria-labelledby={titleId}>
      <ModalHeader title={title} labelId={titleId} />
      <ModalBody>
        <Form id={formId} onSubmit={submit}>
          <ClusterContextText
            cluster={cluster}
            kindLabel={kindLabel}
            objectName={objectName}
            namespace={namespace}
          />
          {children}
          {error !== undefined && error !== null && (
            <Alert isInline variant="danger" title="An error occurred" isLiveRegion>
              {mutationErrorMessage(error)}
            </Alert>
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        {/* OCP `ModalFooterWithAlerts`: buttons 8px apart (`spaceItemsSm`). */}
        <Flex spaceItems={{ default: 'spaceItemsSm' }}>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            isAriaDisabled={isSaving}
            isLoading={isSaving}
            spinnerAriaValueText={isSaving ? 'Saving' : undefined}
          >
            {saveLabel}
          </Button>
          <Button variant="link" onClick={onClose}>
            Cancel
          </Button>
        </Flex>
      </ModalFooter>
    </Modal>
  );
}
