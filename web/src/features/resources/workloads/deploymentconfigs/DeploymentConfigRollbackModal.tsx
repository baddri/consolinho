import { Alert, Checkbox, Spinner } from '@patternfly/react-core';
import { useState } from 'react';
import { DeploymentConfigModel, useK8sGet, type DeploymentConfig, type K8sResource } from '@/shared/k8s';
import { ResourceMutationModal } from '../../actions/ResourceMutationModal';
import { mutationErrorMessage } from '../../actions/useResourceMutation';
import { useRollbackDeploymentConfig, type RollbackSettings } from './useRollbackDeploymentConfig';

/** OCP's message when the owning DeploymentConfig is paused (`rollback-modal.tsx` `deploymentError`). */
export const DC_ROLLBACK_PAUSED_MESSAGE = `You cannot rollback a paused ${DeploymentConfigModel.label}. You must resume it first.`;

/** Props for {@link DeploymentConfigRollbackModal}. */
export interface DeploymentConfigRollbackModalProps {
  cluster: string;
  replicationController: K8sResource;
  /** Name of the DeploymentConfig owning {@link replicationController}. */
  dcName: string;
  onClose: () => void;
}

/** OCP's three settings checkboxes, all unchecked by default (only the pod template is rolled back). */
const SETTINGS: { id: keyof RollbackSettings; label: string }[] = [
  { id: 'includeReplicationMeta', label: 'Replica count and selector' },
  { id: 'includeStrategy', label: 'Deployment strategy' },
  { id: 'includeTriggers', label: 'Deployment trigger' },
];

/**
 * "Rollback" of a DeploymentConfig to one of its ReplicationControllers (OCP `rollback-modal.tsx`, RC branch): loads
 * the owning DeploymentConfig, asks which of the RC's settings to take besides its template ("Use the following
 * settings from <rc> when rolling back:"), then rolls back via {@link useRollbackDeploymentConfig}. While the
 * DeploymentConfig loads a spinner shows; if it can't load or is paused, OCP's danger "Unable to Rollback" alert
 * replaces the form and Rollback is disabled.
 */
export function DeploymentConfigRollbackModal({
  cluster,
  replicationController,
  dcName,
  onClose,
}: DeploymentConfigRollbackModalProps) {
  const namespace = replicationController.metadata.namespace;
  const dc = useK8sGet<DeploymentConfig>(cluster, DeploymentConfigModel, namespace, dcName);
  const rollback = useRollbackDeploymentConfig(cluster);
  const [settings, setSettings] = useState<RollbackSettings>({
    includeReplicationMeta: false,
    includeStrategy: false,
    includeTriggers: false,
  });
  const blocker = dc.error
    ? mutationErrorMessage(dc.error)
    : dc.data?.spec?.paused === true
      ? DC_ROLLBACK_PAUSED_MESSAGE
      : undefined;

  const save = () => {
    rollback.mutate({ namespace, name: dcName, replicationController, ...settings }, { onSuccess: onClose });
  };

  return (
    <ResourceMutationModal
      title="Rollback"
      cluster={cluster}
      namespace={namespace}
      objectName={dcName}
      kindLabel={DeploymentConfigModel.label}
      isSaving={rollback.isPending}
      error={rollback.error}
      onSave={save}
      onClose={onClose}
      saveLabel="Rollback"
      isSaveDisabled={!dc.data || blocker !== undefined}
    >
      {dc.isPending && !dc.error ? (
        <Spinner size="lg" aria-label={`Loading ${DeploymentConfigModel.label}`} />
      ) : blocker === undefined ? (
        <>
          <p>
            Use the following settings from <strong>{replicationController.metadata.name}</strong> when rolling back:
          </p>
          {SETTINGS.map(({ id, label }) => (
            <Checkbox
              key={id}
              id={id}
              label={label}
              isChecked={settings[id]}
              onChange={(_event, checked) => setSettings((current) => ({ ...current, [id]: checked }))}
            />
          ))}
        </>
      ) : (
        <Alert isInline variant="danger" title="Unable to Rollback">
          {blocker}
        </Alert>
      )}
    </ResourceMutationModal>
  );
}
