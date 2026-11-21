import { zodResolver } from '@hookform/resolvers/zod';
import { Modal, Skeleton, Wizard, WizardHeader, WizardStep } from '@patternfly/react-core';
import { useId, useMemo, useRef } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { ClusterEnvironment, Credential } from '@/shared/api';
import { useFormProblem } from '@/shared/forms';
import { ErrorState, useToast } from '@/shared/ui';
import { useClusters } from '../../clusters/api';
import { useFleetCredentials } from '../../credentials/api';
import { useUserGrants } from '../api';
import { bulkGrantedText } from '../grantText';
import { AccessModeStep } from './AccessModeStep';
import { useBulkGrant } from './api';
import { BULK_GRANT_DEFAULTS, bulkGrantSchema, type BulkGrantFormValues } from './bulkGrant.schema';
import { pickCredential } from './pickCredential';
import { ReviewStep, type CredentialsByCluster } from './ReviewStep';
import { SelectClustersStep } from './SelectClustersStep';

/** Props for {@link BulkGrantWizard}. */
export interface BulkGrantWizardProps {
  /** The user who gets access. */
  username: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Step ids; `review` is where every submit happens and where server errors are shown. */
const STEP = { clusters: 'bulk-grant-clusters', mode: 'bulk-grant-mode', review: 'bulk-grant-review' } as const;

/**
 * "Grant `<user>` access to clusters" (US-8, GRANT-4, USR-2): a PF6 `Wizard` in a large `Modal` that grants one user
 * many clusters in one all-or-nothing request — select clusters, choose the access mode (and an optional preferred
 * credential name), then review one row per cluster with its credential. The form mounts only while open, so every
 * opening starts empty. The wizard header owns the only close control (`UX.md` §9).
 */
export function BulkGrantWizard({ username, isOpen, onClose }: BulkGrantWizardProps) {
  const titleId = useId();
  return (
    // PF "Wizard in modal" (`UX.md` §9): no `onClose` on the Modal, so the WizardHeader's X is the only close control;
    // Escape still closes through `onEscapePress`.
    <Modal variant="large" isOpen={isOpen} onEscapePress={onClose} aria-labelledby={titleId}>
      {isOpen && <BulkGrantForm username={username} titleId={titleId} onClose={onClose} />}
    </Modal>
  );
}

/** Groups the fleet's credentials by cluster name (one request serves every row, contract §8). */
function groupByCluster(credentials: readonly Credential[] | undefined): Map<string, Credential[]> {
  const byCluster = new Map<string, Credential[]>();
  for (const credential of credentials ?? []) {
    const list = byCluster.get(credential.clusterName) ?? [];
    list.push(credential);
    byCluster.set(credential.clusterName, list);
  }
  return byCluster;
}

/**
 * Wizard body; owns the form. Loads admin clusters, fleet credentials and the user's grants (already granted clusters
 * are not selectable). Entering Review rebuilds `items` from the selection in display order, keeping row choices
 * while the preferred name is unchanged and otherwise pre-filling with `pickCredential`. Submit maps the rows to the
 * request; a 400 lands on rows via `applyServerErrors` (`items[i].…`), nothing is written and the selection stays.
 */
function BulkGrantForm({ username, titleId, onClose }: { username: string; titleId: string; onClose: () => void }) {
  const toast = useToast();
  const bulkGrant = useBulkGrant();
  const clusters = useClusters();
  const fleetCredentials = useFleetCredentials();
  const grants = useUserGrants(username);

  const form = useForm<BulkGrantFormValues>({
    resolver: zodResolver(bulkGrantSchema),
    defaultValues: BULK_GRANT_DEFAULTS,
  });
  const { replace } = useFieldArray({ control: form.control, name: 'items' });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form);
  const [selected, items] = useWatch({ control: form.control, name: ['clusters', 'items'] });
  // The preferred name the current rows were pre-filled with; another one re-runs `pickCredential`.
  const builtWith = useRef<string | null>(null);

  const credentialsByCluster = useMemo(() => groupByCluster(fleetCredentials.data), [fleetCredentials.data]);
  const credentialCounts = useMemo(
    () => new Map([...credentialsByCluster].map(([name, list]) => [name, list.length])),
    [credentialsByCluster],
  );
  const environments = useMemo(
    () => new Map<string, ClusterEnvironment>((clusters.data ?? []).map((c) => [c.name, c.environment])),
    [clusters.data],
  );
  const granted = useMemo(() => new Set((grants.data ?? []).map((grant) => grant.clusterName)), [grants.data]);

  const buildItems = () => {
    const { clusters: names, preferredCredentialName, items: previous } = form.getValues();
    const keep = builtWith.current === preferredCredentialName;
    builtWith.current = preferredCredentialName;
    form.clearErrors('items');
    clearProblem();
    replace(
      names.map((clusterName) => {
        const kept = keep ? previous.find((item) => item.clusterName === clusterName)?.credentialId : undefined;
        const picked = pickCredential(credentialsByCluster.get(clusterName) ?? [], preferredCredentialName);
        return { clusterName, credentialId: kept ?? picked ?? '' };
      }),
    );
  };

  const submit = handleSubmit(async (values) => {
    const created = await bulkGrant.mutateAsync({
      username,
      accessMode: values.accessMode,
      items: values.items.map(({ clusterName, credentialId }) => ({ clusterName, credentialId })),
    });
    toast.success(bulkGrantedText(username, values.accessMode, created.length));
    onClose();
  });

  const loadError = clusters.error ?? fleetCredentials.error ?? grants.error;
  const isLoading = clusters.isPending || fleetCredentials.isPending || grants.isPending;
  const nothingSelected = selected.length === 0;
  const missingCredential = items.some((item) => item.credentialId === '');
  const isSubmitting = form.formState.isSubmitting;

  return (
    <Wizard
      header={
        <WizardHeader
          title={`Grant ${username} access to clusters`}
          titleId={titleId}
          // PF leaves the X unnamed by default.
          closeButtonAriaLabel="Close"
          onClose={onClose}
        />
      }
      onClose={onClose}
      onSave={() => void submit()}
      isVisitRequired
      onStepChange={(_event, current) => {
        if (current.id === STEP.review) buildItems();
      }}
    >
      <WizardStep
        id={STEP.clusters}
        name="Select clusters"
        footer={{ isNextDisabled: nothingSelected || isLoading || loadError !== null }}
      >
        {isLoading && <Skeleton height="12rem" screenreaderText="Loading clusters" />}
        {!isLoading && loadError !== null && (
          <ErrorState
            error={loadError}
            title="Could not load clusters"
            onRetry={() => {
              void clusters.refetch();
              void fleetCredentials.refetch();
              void grants.refetch();
            }}
          />
        )}
        {!isLoading && loadError === null && (
          <SelectClustersStep
            control={form.control}
            clusters={clusters.data ?? []}
            credentialCounts={credentialCounts}
            granted={granted}
          />
        )}
      </WizardStep>
      <WizardStep id={STEP.mode} name="Access mode" isDisabled={nothingSelected}>
        <AccessModeStep control={form.control} />
      </WizardStep>
      <WizardStep
        id={STEP.review}
        name="Review"
        isDisabled={nothingSelected}
        footer={{
          nextButtonText: 'Grant access',
          isNextDisabled: missingCredential || items.length === 0 || isSubmitting,
          nextButtonProps: { isLoading: isSubmitting },
        }}
      >
        <ReviewStep
          control={form.control}
          environments={environments}
          credentials={{
            byCluster: credentialsByCluster,
            isPending: fleetCredentials.isPending,
            isLoadError: fleetCredentials.error !== null,
          } satisfies CredentialsByCluster}
          problem={problem}
        />
      </WizardStep>
    </Wizard>
  );
}
