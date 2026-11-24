import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, FormSection, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  isApiError,
  type ClusterDetail,
  type ClusterEnvironment,
  type Grant,
  type GrantSubjectKind,
} from '@/shared/api';
import { ConflictAlert, FormProblemAlert, RadioGroupField, useFormProblem } from '@/shared/forms';
import { EnvironmentLabel, InlineLabelTitle, useToast } from '@/shared/ui';
import { isGrantGone, useClusterGrants, useCreateGrant, useCreateGroupGrant, useUpdateGrant } from './api';
import { CredentialPicker } from './CredentialPicker';
import { grantFormSchema, type GrantFormValues } from './grantForm.schema';
import {
  ACCESS_MODE_OPTIONS,
  alreadyRevokedText,
  changedText,
  editTitleText,
  grantedText,
  priorityTakenText,
  productionGroupWriteWarning,
  productionWriteWarning,
} from './grantText';
import { PriorityField, type UsedPriority } from './PriorityField';
import { SubjectSection } from './SubjectSection';

/** The cluster a grant dialog on the cluster page acts on. */
export type GrantCluster = Pick<ClusterDetail, 'name' | 'environment'>;

/** Props for {@link GrantFormModal}. */
export type GrantFormModalProps =
  | {
      mode: 'create';
      /** The cluster to grant access to (create runs from its Access tab; users get access via the bulk wizard). */
      cluster: GrantCluster;
      /**
       * The cluster's current grants: their users and groups are offered disabled ("already has access"), and the
       * group grants' priorities are listed under Priority.
       */
      existing: readonly Grant[];
      onClose: () => void;
    }
  | {
      mode: 'edit';
      /**
       * The grant to change, kept current by the caller. Its `version` seeds the form once; later refetches don't
       * change what is sent (only "Reload latest values" does).
       */
      grant: Grant;
      /** Refetches the page's grants and returns the fresh representation of this one ("Reload latest values"). */
      onReload: () => Promise<Grant | undefined>;
      onClose: () => void;
    };

/** Form values showing `grant` as it is now. */
const valuesOf = (grant: Grant): GrantFormValues => ({
  subjectKind: grant.subjectKind,
  target: grant.subjectName,
  priority: grant.priority,
  credentialId: grant.credentialId,
  accessMode: grant.accessMode,
  version: grant.version,
});

/** Dialog title and the environment of its cluster, shown beside it. */
function titleOf(props: GrantFormModalProps): { title: string; environment: ClusterEnvironment } {
  if (props.mode === 'edit') {
    return { title: editTitleText(props.grant), environment: props.grant.clusterEnvironment };
  }
  return { title: `Grant access to ${props.cluster.name}`, environment: props.cluster.environment };
}

/** The group grants' priorities among `grants`, without `exceptId` (the edited grant), highest first. */
function usedPrioritiesOf(grants: readonly Grant[], exceptId?: string): UsedPriority[] {
  return grants
    .flatMap((grant) =>
      grant.subjectKind === 'group' && grant.priority !== null && grant.id !== exceptId
        ? [{ priority: grant.priority, groupName: grant.subjectName }]
        : [],
    )
    .sort((a, b) => b.priority - a.priority);
}

/** The schema requires a priority for groups; reaching this without one is a bug, not something to send as 0. */
function requiredPriority(priority: number | null): number {
  if (priority === null)
    throw new Error('A group grant needs a priority; the form schema should have required it.');
  return priority;
}

/**
 * The group a 409 `Grants.PriorityTaken` names (the Api's detail quotes it in backticks), so the field can show the
 * client copy without markup; `undefined` for any other error. An unparsable detail names no group.
 */
function priorityTakenBy(error: unknown): string | undefined {
  if (!isApiError(error) || error.code !== 'Grants.PriorityTaken') return undefined;
  return /`([^`]+)`/.exec(error.detail ?? '')?.[1] ?? 'another group';
}

/** Names of the subjects of `kind` holding a grant in `grants`. */
const grantedOf = (grants: readonly Grant[], kind: GrantSubjectKind): ReadonlySet<string> =>
  new Set(grants.flatMap((grant) => (grant.subjectKind === kind ? [grant.subjectName] : [])));

/**
 * Create / change dialog of one grant (GRANT-1/2/3, Q7, UIG-1/3/5). Create runs from a cluster's Access tab: the
 * `SubjectSection` picks User (default) or Group and the subject name, existing holders offered disabled (the user
 * page grants through the bulk wizard); in create mode the access fields follow in an "Access" `FormSection`. Groups
 * also need a Priority, unique per cluster. Then the credential
 * (`CredentialPicker`, pre-selected when the cluster has one) and the access mode, read only by default. Read write
 * on a production cluster shows an inline warning naming it (and the group). Edit changes mode, credential and a
 * group's priority, with the grant's `version`; a stale one shows `ConflictAlert` without losing input. A duplicate
 * (409 `Grants.AlreadyExists`) and name errors land on Subject name, a taken priority (409 `Grants.PriorityTaken`) on
 * Priority, a bad credential (400 `credentialId`) on the credential field.
 */
export function GrantFormModal(props: GrantFormModalProps) {
  const titleId = useId();
  const labelId = useId();
  const { title, environment } = titleOf(props);
  return (
    <Modal variant="medium" isOpen onClose={props.onClose} aria-labelledby={`${titleId} ${labelId}`}>
      <ModalHeader
        title={
          <InlineLabelTitle
            title={title}
            titleId={titleId}
            label={<EnvironmentLabel environment={environment} isCompact />}
            labelId={labelId}
          />
        }
      />
      <GrantForm {...props} />
    </Modal>
  );
}

/** Body and footer of {@link GrantFormModal}; owns the form state. */
function GrantForm(props: GrantFormModalProps) {
  const formId = useId();
  const toast = useToast();
  const create = useCreateGrant();
  const createGroup = useCreateGroupGrant();
  const update = useUpdateGrant();

  const form = useForm<GrantFormValues>({
    resolver: zodResolver(grantFormSchema()),
    defaultValues:
      props.mode === 'edit'
        ? valuesOf(props.grant)
        : {
            subjectKind: 'user',
            target: '',
            priority: null,
            credentialId: '',
            accessMode: 'readOnly',
            version: 0,
          },
  });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form, {
    // The subject name picker is the field the server calls `username` or `groupName`.
    fieldMap: { username: 'target', groupName: 'target' },
    // `Grants.PriorityTaken` is set by `submit` itself, with the client copy (the Api's detail has markup).
    codeToField: { 'Grants.AlreadyExists': 'target' },
  });
  const [subjectKind, target, accessMode] = useWatch({
    control: form.control,
    name: ['subjectKind', 'target', 'accessMode'],
  });

  const { clusterName, environment } =
    props.mode === 'edit'
      ? { clusterName: props.grant.clusterName, environment: props.grant.clusterEnvironment }
      : { clusterName: props.cluster.name, environment: props.cluster.environment };
  // Editing a group grant lists the cluster's other priorities; the Access tab has them cached already.
  const isGroupEdit = props.mode === 'edit' && props.grant.subjectKind === 'group';
  const clusterGrants = useClusterGrants(clusterName, { enabled: isGroupEdit });
  const usedPriorities =
    props.mode === 'create'
      ? usedPrioritiesOf(props.existing)
      : usedPrioritiesOf(clusterGrants.data ?? [], props.grant.id);
  // Only direct grants mark a user as "already has access"; group grants on the cluster don't (PREC-3).
  const existing = props.mode === 'create' ? props.existing : [];
  const granted = { user: grantedOf(existing, 'user'), group: grantedOf(existing, 'group') };

  const clearSubject = () => {
    form.setValue('target', '');
    form.setValue('priority', null);
    form.clearErrors(['target', 'priority']);
  };

  const setPriorityTaken = (priority: number, groupName: string) =>
    form.setError(
      'priority',
      { type: 'taken', message: priorityTakenText(priority, groupName) },
      { shouldFocus: true },
    );

  const save = async (values: GrantFormValues) => {
    const { credentialId, accessMode: mode, priority } = values;
    if (props.mode === 'create') {
      const created =
        values.subjectKind === 'group'
          ? await createGroup.mutateAsync({
              groupName: values.target.trim(),
              clusterName,
              credentialId,
              accessMode: mode,
              priority: requiredPriority(priority),
            })
          : await create.mutateAsync({
              username: values.target,
              clusterName,
              credentialId,
              accessMode: mode,
            });
      toast.success(grantedText(created));
      props.onClose();
      return;
    }
    const { grant } = props;
    try {
      const changed = await update.mutateAsync({
        grantId: grant.id,
        accessMode: mode,
        credentialId,
        priority: grant.subjectKind === 'group' ? priority : undefined,
        version: values.version,
      });
      toast.success(changedText(changed));
      props.onClose();
    } catch (error) {
      if (!isGrantGone(error)) throw error;
      toast.warning(alreadyRevokedText(grant), 'Another administrator revoked it.');
      props.onClose();
    }
  };

  const submit = handleSubmit(async (values) => {
    const holder =
      values.subjectKind === 'group'
        ? usedPriorities.find((used) => used.priority === values.priority)
        : undefined;
    if (holder) {
      setPriorityTaken(holder.priority, holder.groupName);
      return;
    }
    try {
      await save(values);
    } catch (error) {
      const taken = priorityTakenBy(error);
      if (taken === undefined || values.priority === null) throw error;
      setPriorityTaken(values.priority, taken);
    }
  });

  const reload = () => {
    if (props.mode !== 'edit') return;
    void props.onReload().then((fresh) => {
      if (fresh) form.reset(valuesOf(fresh));
      clearProblem();
    });
  };

  const accessFields = (
    <>
      {subjectKind === 'group' && (
        <PriorityField control={form.control} name="priority" usedPriorities={usedPriorities} />
      )}
      <CredentialPicker control={form.control} clusterName={clusterName} />
      <RadioGroupField
        control={form.control}
        name="accessMode"
        label="Access mode"
        isRequired
        options={ACCESS_MODE_OPTIONS}
      />
      {accessMode === 'readWrite' && environment === 'production' && (
        <Alert
          variant="warning"
          isInline
          isPlain
          title={
            subjectKind === 'group'
              ? productionGroupWriteWarning(target, clusterName)
              : productionWriteWarning(clusterName)
          }
        />
      )}
    </>
  );

  return (
    <>
      <ModalBody>
        <Form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <ConflictAlert problem={problem} onReload={reload} />
          <FormProblemAlert problem={problem} />
          {props.mode === 'create' ? (
            <>
              <SubjectSection control={form.control} granted={granted} onKindChange={clearSubject} />
              {/* OCP `bindings.tsx` titles every group of its form, so subject and access fields get section spacing. */}
              <FormSection title="Access" titleElement="h2">
                {accessFields}
              </FormSection>
            </>
          ) : (
            accessFields
          )}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form={formId}
          isAriaDisabled={form.formState.isSubmitting}
          isLoading={form.formState.isSubmitting}
        >
          {props.mode === 'create' ? 'Grant access' : 'Save'}
        </Button>
        <Button variant="link" onClick={props.onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </>
  );
}
