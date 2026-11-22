import { zodResolver } from '@hookform/resolvers/zod';
import { ActionGroup, Button, Content } from '@patternfly/react-core';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { ClusterDetail } from '@/shared/api';
import { ConflictAlert, FormProblemAlert, useFormProblem } from '@/shared/forms';
import { ActionButton, ConfirmModal, EnvironmentLabel, FlexForm, FormBody, FormFooter } from '@/shared/ui';
import { useAdminAccess } from '../../useAdminAccess';
import { clusterDetailPath } from '../clusterTarget';
import {
  clusterFormSchema,
  needsInsecureProductionConfirmation,
  REGISTER_CLUSTER_DEFAULTS,
  toClusterFormInput,
  type ClusterFormInput,
  type ClusterFormValues,
} from './clusterForm.schema';
import { ConnectionSection, IdentitySection, LinksSection, StatusSection } from './ClusterFormSections';
import { useSaveCluster } from './useSaveCluster';
import { PRODUCT_NAME } from '@/shared/branding';
import { fleetAdminPath } from '@/shared/routing';

/** Path of the clusters list (Cancel target of the register form). */
const CLUSTERS_PATH = fleetAdminPath('clusters');

/** Props for {@link ClusterForm}. */
export interface ClusterFormProps {
  /** Edit mode: the loaded cluster, whose values and `version` seed the form. Create mode when absent. */
  cluster?: ClusterDetail;
  /** Edit mode: refetches the cluster for "Reload latest values" after a version conflict (ADM-4). */
  onReload?: () => Promise<ClusterDetail | undefined>;
}

/**
 * Register / edit cluster form (CLU-1..4). Client rules come from `clusterFormSchema`; server 400s land on their
 * fields (`apiUrl`, `caBundle`, `skipTlsVerify`, …) and 409 `Clusters.NameTaken` on the name. A stale `version`
 * shows `ConflictAlert`; the typed values stay until the admin reloads. Saving a **production** cluster with Skip TLS
 * on first asks for confirmation (CLU-3, UI-only); cancelling sends nothing. Read-only admins see the form with Save
 * aria-disabled and the reason (ADM-2).
 */
export function ClusterForm({ cluster, onReload }: ClusterFormProps) {
  const isEdit = cluster !== undefined;
  const navigate = useNavigate();
  const { readOnlyReason } = useAdminAccess();
  const save = useSaveCluster(isEdit);
  const form = useForm<ClusterFormInput, unknown, ClusterFormValues>({
    resolver: zodResolver(clusterFormSchema),
    defaultValues: cluster ? toClusterFormInput(cluster) : REGISTER_CLUSTER_DEFAULTS,
  });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form, {
    codeToField: { 'Clusters.NameTaken': 'name' },
  });
  /** Name of the production cluster awaiting the Skip TLS confirmation; `null` when the dialog is closed. */
  const [confirmingName, setConfirmingName] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);
  const isSubmitting = form.formState.isSubmitting;

  const submit = handleSubmit(async (values) => {
    // Enter in a field submits even though Save is aria-disabled for read-only admins.
    if (readOnlyReason !== undefined) return;
    if (needsInsecureProductionConfirmation(values)) {
      setConfirmingName(values.name);
      return;
    }
    await save(values);
  });

  // Re-validates the unchanged values, then saves; the dialog shows the pending save and closes afterwards.
  const confirmedSubmit = handleSubmit(async (values) => {
    try {
      await save(values);
    } finally {
      setConfirmingName(null);
    }
  });

  const reload = async () => {
    if (onReload === undefined) return;
    setIsReloading(true);
    try {
      const fresh = await onReload();
      if (fresh !== undefined) {
        form.reset(toClusterFormInput(fresh));
        clearProblem();
      }
    } finally {
      setIsReloading(false);
    }
  };

  const cancelPath = cluster ? clusterDetailPath(cluster.name) : CLUSTERS_PATH;

  return (
    <>
      {/* OCP full-page form (`UX.md` §8): 650px field column, buttons in a sticky footer. */}
      <FlexForm onSubmit={(event) => void submit(event)}>
        <FormBody>
          <IdentitySection control={form.control} isEdit={isEdit} />
          <ConnectionSection control={form.control} isEdit={isEdit} />
          <LinksSection control={form.control} />
          {!isEdit && <StatusSection control={form.control} />}
        </FormBody>
        <FormFooter
          actions={
            <ActionGroup>
              <ActionButton
                type="submit"
                disabledReason={readOnlyReason}
                isAriaDisabled={isSubmitting}
                isLoading={isSubmitting}
              >
                {isEdit ? 'Save' : 'Register'}
              </ActionButton>
              <Button variant="secondary" onClick={() => void navigate(cancelPath)}>
                Cancel
              </Button>
            </ActionGroup>
          }
        >
          {/* Server errors sit right above the buttons that caused them (OCP `ButtonBar`, `UX.md` §8). */}
          <ConflictAlert problem={problem} onReload={() => void reload()} isReloading={isReloading} />
          <FormProblemAlert problem={problem} />
        </FormFooter>
      </FlexForm>
      <ConfirmModal
        isOpen={confirmingName !== null}
        title="Save without TLS verification"
        titleLabel={<EnvironmentLabel environment="production" isCompact />}
        confirmLabel="Save without TLS verification"
        variant="danger"
        isPending={isSubmitting}
        onConfirm={() => void confirmedSubmit()}
        onClose={() => setConfirmingName(null)}
      >
        <Content component="p">
          {`Save ${confirmingName ?? ''} (production) without TLS verification? ${PRODUCT_NAME} will not be able to ` +
            "detect a man-in-the-middle between itself and this cluster's API server."}
        </Content>
      </ConfirmModal>
    </>
  );
}
