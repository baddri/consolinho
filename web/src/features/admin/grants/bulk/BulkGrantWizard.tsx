import { zodResolver } from '@hookform/resolvers/zod';
import { Modal, Skeleton, Wizard, WizardHeader, WizardStep } from '@patternfly/react-core';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { ClusterEnvironment, Credential, Grant } from '@/shared/api';
import { useFormProblem } from '@/shared/forms';
import { ErrorState, useToast } from '@/shared/ui';
import { useClusters } from '../../clusters/api';
import { useFleetCredentials } from '../../credentials/api';
import { useGroupGrants, useUserGrants } from '../api';
import { bulkGrantedText, bulkGrantTitle, type BulkGrantSubject } from '../grantText';
import { AccessModeStep } from './AccessModeStep';
import { useBulkGrant, useBulkGroupGrant } from './api';
import {
  bulkGrantDefaults,
  bulkGrantSchema,
  isValidPriority,
  type BulkGrantFormValues,
} from './bulkGrant.schema';
import { pickCredential } from './pickCredential';
import { ReviewStep, type CredentialsByCluster } from './ReviewStep';
import { SelectClustersStep } from './SelectClustersStep';

/** Props for {@link BulkGrantWizard}. */
export interface BulkGrantWizardProps {
  /** Who gets access: a FleetConsole user (GRANT-4) or a group (GPG-3). */
  subject: BulkGrantSubject;
  isOpen: boolean;
  onClose: () => void;
}

/** Step ids; `review` is where every submit happens and where server errors are shown. */
const STEP = { clusters: 'bulk-grant-clusters', mode: 'bulk-grant-mode', review: 'bulk-grant-review' } as const;

/**
 * "Grant `<user>` access to clusters" (US-8, GRANT-4, USR-2) or "Grant group `<group>` access to clusters" (GPG-3): a
 * PF6 `Wizard` in a large `Modal` that grants one subject many clusters in one all-or-nothing request — select
 * clusters, choose the access mode (groups also one priority; an optional preferred credential name), then review
 * one row per cluster with its credential. The form mounts only while open, so every opening starts empty. The
 * wizard header owns the only close control (`UX.md` §9).
 */
export function BulkGrantWizard({ subject, isOpen, onClose }: BulkGrantWizardProps) {
  const titleId = useId();
  const formProps = { titleId, onClose };
  return (
    // PF "Wizard in modal" (`UX.md` §9): no `onClose` on the Modal, so the WizardHeader's X is the only close control;
    // Escape still closes through `onEscapePress`.
    <Modal variant="large" isOpen={isOpen} onEscapePress={onClose} aria-labelledby={titleId}>
      {isOpen &&
        (subject.kind === 'group' ? (
          <GroupBulkGrantForm groupName={subject.name} {...formProps} />
        ) : (
          <UserBulkGrantForm username={subject.name} {...formProps} />
        ))}
    </Modal>
  );
}

/** What both subject kinds share in the wizard body. */
interface FormProps {
  titleId: string;
  onClose: () => void;
}

/** The request rows of the review, in display order (their indexes key the server's `items[i].…` errors). */
const requestItems = (values: BulkGrantFormValues) =>
  values.items.map(({ clusterName, credentialId }) => ({ clusterName, credentialId }));

/** The user wizard body: the user's grants mark already granted clusters; submits the user bulk (GRANT-4). */
function UserBulkGrantForm({ username, ...props }: FormProps & { username: string }) {
  const grants = useUserGrants(username);
  const bulkGrant = useBulkGrant();
  return (
    <BulkGrantForm
      {...props}
      subject={{ kind: 'user', name: username }}
      grants={grants}
      grant={(values) =>
        bulkGrant.mutateAsync({ username, accessMode: values.accessMode, items: requestItems(values) })
      }
    />
  );
}

/** The group wizard body: the group's grants mark already granted clusters; submits the group bulk with its priority. */
function GroupBulkGrantForm({ groupName, ...props }: FormProps & { groupName: string }) {
  const grants = useGroupGrants(groupName);
  const bulkGrant = useBulkGroupGrant();
  return (
    <BulkGrantForm
      {...props}
      subject={{ kind: 'group', name: groupName }}
      grants={grants}
      grant={(values) =>
        bulkGrant.mutateAsync({
          groupName,
          accessMode: values.accessMode,
          // The schema requires a priority for groups, so `null` never gets here.
          priority: values.priority ?? 0,
          items: requestItems(values),
        })
      }
    />
  );
}

/** Props for {@link BulkGrantForm}. */
interface BulkGrantFormProps extends FormProps {
  subject: BulkGrantSubject;
  /** The subject's grants: their clusters are listed but not selectable. */
  grants: UseQueryResult<Grant[]>;
  /** Sends the bulk request for the valid form values; rejects with the Api error. */
  grant: (values: BulkGrantFormValues) => Promise<Grant[]>;
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
 * Wizard body; owns the form. Loads admin clusters and fleet credentials; `grants` (already granted clusters) come
 * from the subject's wrapper. Groups enter one priority on the access mode step, validated as it is typed; Next waits
 * for a valid one. Entering Review rebuilds `items` from the selection in display order, keeping row choices
 * while the preferred name is unchanged and otherwise pre-filling with `pickCredential`. Submit maps the rows to the
 * request; a 400 lands on rows via `applyServerErrors` (`items[i].…`), nothing is written and the selection stays;
 * "Remove" on a flagged row deselects its cluster so the rest can be resubmitted (GPG-3).
 */
function BulkGrantForm({ subject, titleId, onClose, grants, grant }: BulkGrantFormProps) {
  const toast = useToast();
  const clusters = useClusters();
  const fleetCredentials = useFleetCredentials();
  const isGroup = subject.kind === 'group';

  const form = useForm<BulkGrantFormValues>({
    resolver: zodResolver(bulkGrantSchema),
    defaultValues: bulkGrantDefaults(subject.kind),
  });
  const { replace } = useFieldArray({ control: form.control, name: 'items' });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form);
  const [selected, items, priority] = useWatch({
    control: form.control,
    name: ['clusters', 'items', 'priority'],
  });
  // Shows a range error while the priority is typed; an empty field only keeps Next disabled.
  const { trigger } = form;
  useEffect(() => {
    if (isGroup && priority !== null) void trigger('priority');
  }, [isGroup, priority, trigger]);
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
    const created = await grant(values);
    toast.success(bulkGrantedText(subject, values.accessMode, created.length));
    onClose();
  });

  /**
   * Drops row `index` and deselects its cluster; the other rows keep their credentials and server errors.
   * `useFieldArray.remove` would re-run the resolver after a submit and wipe the other rows' server errors, so the
   * rows are set without validation and the remaining errors are moved to their new indexes by hand.
   */
  const removeRow = (index: number) => {
    const { items: rows, clusters: names } = form.getValues();
    const clusterName = rows[index]?.clusterName;
    const rowErrors = form.formState.errors.items;
    const remaining = rows
      .map((row, i) => ({ row, error: rowErrors?.[i] }))
      .filter((_, i) => i !== index);
    form.setValue(
      'items',
      remaining.map(({ row }) => row),
    );
    form.setValue(
      'clusters',
      names.filter((name) => name !== clusterName),
    );
    form.clearErrors('items');
    remaining.forEach(({ error }, i) => {
      for (const field of ['clusterName', 'credentialId'] as const) {
        const message = error?.[field]?.message;
        if (message !== undefined) form.setError(`items.${i}.${field}`, { type: 'server', message });
      }
    });
  };

  const loadError = clusters.error ?? fleetCredentials.error ?? grants.error;
  const isLoading = clusters.isPending || fleetCredentials.isPending || grants.isPending;
  const nothingSelected = selected.length === 0;
  const missingCredential = items.some((item) => item.credentialId === '');
  const isSubmitting = form.formState.isSubmitting;
  const missingPriority = isGroup && !isValidPriority(priority);

  return (
    <Wizard
      header={
        <WizardHeader
          title={bulkGrantTitle(subject)}
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
      <WizardStep
        id={STEP.mode}
        name="Access mode"
        isDisabled={nothingSelected}
        footer={{ isNextDisabled: missingPriority }}
      >
        <AccessModeStep control={form.control} isGroup={isGroup} />
      </WizardStep>
      <WizardStep
        id={STEP.review}
        name="Review"
        isDisabled={nothingSelected}
        footer={{
          nextButtonText: 'Grant access',
          isNextDisabled: missingCredential || missingPriority || items.length === 0 || isSubmitting,
          nextButtonProps: { isLoading: isSubmitting },
        }}
      >
        <ReviewStep
          control={form.control}
          subject={subject}
          environments={environments}
          credentials={{
            byCluster: credentialsByCluster,
            isPending: fleetCredentials.isPending,
            isLoadError: fleetCredentials.error !== null,
          } satisfies CredentialsByCluster}
          problem={problem}
          onRemove={removeRow}
        />
      </WizardStep>
    </Wizard>
  );
}
