import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { ClusterDetail, ClusterEnvironment, Grant } from '@/shared/api';
import {
  ConflictAlert,
  FormProblemAlert,
  RadioGroupField,
  useFormProblem,
} from '@/shared/forms';
import { EnvironmentLabel, InlineLabelTitle, useToast } from '@/shared/ui';
import { isGrantGone, useCreateGrant, useUpdateGrant } from './api';
import { CredentialPicker } from './CredentialPicker';
import { grantFormSchema, type GrantFormValues } from './grantForm.schema';
import { ACCESS_MODE_OPTIONS, alreadyRevokedText, changedText, grantedText, productionWriteWarning } from './grantText';
import { UserTypeahead } from './UserTypeahead';

/** The cluster a grant dialog on the cluster page acts on. */
export type GrantCluster = Pick<ClusterDetail, 'name' | 'environment'>;

/** Props for {@link GrantFormModal}. */
export type GrantFormModalProps =
  | {
      mode: 'create';
      /** The cluster to grant access to (create runs from its Access tab; users get access via the bulk wizard). */
      cluster: GrantCluster;
      /** The cluster's current grants: their users are offered disabled ("already has access"). */
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
  target: grant.username,
  credentialId: grant.credentialId,
  accessMode: grant.accessMode,
  version: grant.version,
});

/** Dialog title and the environment of its cluster, shown beside it. */
function titleOf(props: GrantFormModalProps): { title: string; environment: ClusterEnvironment } {
  if (props.mode === 'edit') {
    return {
      title: `Change ${props.grant.username}'s access to ${props.grant.clusterName}`,
      environment: props.grant.clusterEnvironment,
    };
  }
  return { title: `Grant access to ${props.cluster.name}`, environment: props.cluster.environment };
}

/**
 * Create / change dialog of one grant (GRANT-1/2/3, Q7). Create runs from a cluster's Access tab and picks a user
 * (`UserTypeahead`), users with a grant offered disabled (the user page grants through the bulk wizard). Then the
 * credential (`CredentialPicker`, pre-selected when the cluster has one) and the access mode, read only by default.
 * Read write on a production cluster shows an inline warning naming it. Edit changes mode and credential only, with
 * the grant's `version`; a stale one shows `ConflictAlert` without losing input. A duplicate (409
 * `Grants.AlreadyExists`) lands on the picker, a bad credential (400 `credentialId`) on the credential field.
 */
export function GrantFormModal(props: GrantFormModalProps) {
  const titleId = useId();
  const labelId = useId();
  const { title, environment } = titleOf(props);
  return (
    <Modal
      variant="medium"
      isOpen
      onClose={props.onClose}
      aria-labelledby={`${titleId} ${labelId}`}
    >
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
  const update = useUpdateGrant();

  const form = useForm<GrantFormValues>({
    resolver: zodResolver(grantFormSchema()),
    defaultValues:
      props.mode === 'edit'
        ? valuesOf(props.grant)
        : { target: '', credentialId: '', accessMode: 'readOnly', version: 0 },
  });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form, {
    // The user picker is the field the server calls `username`.
    fieldMap: { username: 'target' },
    codeToField: { 'Grants.AlreadyExists': 'target' },
  });
  const [target, accessMode] = useWatch({ control: form.control, name: ['target', 'accessMode'] });

  const { clusterName, username, environment } =
    props.mode === 'edit'
      ? { ...props.grant, environment: props.grant.clusterEnvironment }
      : { clusterName: props.cluster.name, username: target, environment: props.cluster.environment };
  const granted = new Set(props.mode === 'create' ? props.existing.map((grant) => grant.username) : []);

  const submit = handleSubmit(async (values) => {
    if (props.mode === 'create') {
      const created = await create.mutateAsync({
        username,
        clusterName,
        credentialId: values.credentialId,
        accessMode: values.accessMode,
      });
      toast.success(grantedText(created));
      props.onClose();
      return;
    }
    try {
      const changed = await update.mutateAsync({
        grantId: props.grant.id,
        accessMode: values.accessMode,
        credentialId: values.credentialId,
        version: values.version,
      });
      toast.success(changedText(changed));
      props.onClose();
    } catch (error) {
      if (!isGrantGone(error)) throw error;
      toast.warning(alreadyRevokedText({ username, clusterName }), 'Another administrator revoked it.');
      props.onClose();
    }
  });

  const reload = () => {
    if (props.mode !== 'edit') return;
    void props.onReload().then((fresh) => {
      if (fresh) form.reset(valuesOf(fresh));
      clearProblem();
    });
  };

  return (
    <>
      <ModalBody>
        <Form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <ConflictAlert problem={problem} onReload={reload} />
          <FormProblemAlert problem={problem} />
          {props.mode === 'create' && <UserTypeahead control={form.control} granted={granted} />}
          <CredentialPicker control={form.control} clusterName={clusterName} />
          <RadioGroupField
            control={form.control}
            name="accessMode"
            label="Access mode"
            isRequired
            options={ACCESS_MODE_OPTIONS}
          />
          {accessMode === 'readWrite' && environment === 'production' && (
            <Alert variant="warning" isInline isPlain title={productionWriteWarning(clusterName)} />
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
