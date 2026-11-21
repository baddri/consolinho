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
import { EnvironmentLabel, useToast } from '@/shared/ui';
// Not re-exported from the barrel yet (`shared/ui/index.ts` is outside T-0116's paths).
import { InlineLabelTitle } from '@/shared/ui/ConfirmModal';
import { useClusters } from '../clusters/api';
import { isGrantGone, useCreateGrant, useUpdateGrant } from './api';
import { ClusterTypeahead } from './ClusterTypeahead';
import { CredentialPicker } from './CredentialPicker';
import { grantFormSchema, type GrantFormValues } from './grantForm.schema';
import type { GrantPerspective } from './GrantRow';
import { ACCESS_MODE_OPTIONS, alreadyRevokedText, changedText, grantedText, productionWriteWarning } from './grantText';
import { UserTypeahead } from './UserTypeahead';

/** The cluster a grant dialog on the cluster page acts on. */
export type GrantCluster = Pick<ClusterDetail, 'name' | 'environment'>;

/** Where "add access" was started: a user's page (pick a cluster) or a cluster's page (pick a user). */
export type GrantCreateTarget =
  | { perspective: 'user'; username: string }
  | { perspective: 'cluster'; cluster: GrantCluster };

/** Props for {@link GrantFormModal}. */
export type GrantFormModalProps =
  | {
      mode: 'create';
      target: GrantCreateTarget;
      /** The page's current grants: their other side is offered disabled ("already has access"). */
      existing: readonly Grant[];
      onClose: () => void;
    }
  | {
      mode: 'edit';
      perspective: GrantPerspective;
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
const valuesOf = (grant: Grant, perspective: GrantPerspective): GrantFormValues => ({
  target: perspective === 'user' ? grant.clusterName : grant.username,
  credentialId: grant.credentialId,
  accessMode: grant.accessMode,
  version: grant.version,
});

/** Dialog title and the environment shown beside it (unknown while a cluster is still to be picked). */
function titleOf(props: GrantFormModalProps): { title: string; environment?: ClusterEnvironment } {
  if (props.mode === 'edit') {
    return {
      title: `Change ${props.grant.username}'s access to ${props.grant.clusterName}`,
      environment: props.grant.clusterEnvironment,
    };
  }
  return props.target.perspective === 'user'
    ? { title: `Add cluster access for ${props.target.username}` }
    : { title: `Grant access to ${props.target.cluster.name}`, environment: props.target.cluster.environment };
}

/**
 * Create / change dialog of one grant (GRANT-1/2/3, Q7). Create from the user page picks a cluster
 * (`ClusterTypeahead`), from the cluster page a user (`UserTypeahead`); existing grants are offered disabled. Then the
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
      aria-labelledby={environment === undefined ? titleId : `${titleId} ${labelId}`}
    >
      <ModalHeader
        title={
          <InlineLabelTitle
            title={title}
            titleId={titleId}
            label={environment !== undefined ? <EnvironmentLabel environment={environment} isCompact /> : undefined}
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
  const clusters = useClusters();
  const perspective = props.mode === 'edit' ? props.perspective : props.target.perspective;

  const form = useForm<GrantFormValues>({
    resolver: zodResolver(grantFormSchema(perspective)),
    defaultValues:
      props.mode === 'edit'
        ? valuesOf(props.grant, perspective)
        : { target: '', credentialId: '', accessMode: 'readOnly', version: 0 },
  });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form, {
    // The picker is the field the server calls `clusterName` (user page) or `username` (cluster page).
    fieldMap: perspective === 'user' ? { clusterName: 'target' } : { username: 'target' },
    codeToField: { 'Grants.AlreadyExists': 'target' },
  });
  const [target, accessMode] = useWatch({ control: form.control, name: ['target', 'accessMode'] });

  let clusterName: string;
  let username: string;
  let environment: ClusterEnvironment | undefined;
  if (props.mode === 'edit') {
    ({ clusterName, username } = props.grant);
    environment = props.grant.clusterEnvironment;
  } else if (props.target.perspective === 'user') {
    clusterName = target;
    username = props.target.username;
    environment = clusters.data?.find((cluster) => cluster.name === target)?.environment;
  } else {
    clusterName = props.target.cluster.name;
    username = target;
    environment = props.target.cluster.environment;
  }
  const existing = props.mode === 'create' ? props.existing : [];
  const granted = new Set(existing.map((grant) => (perspective === 'user' ? grant.clusterName : grant.username)));

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
      if (fresh) form.reset(valuesOf(fresh, perspective));
      clearProblem();
    });
  };

  return (
    <>
      <ModalBody>
        <Form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <ConflictAlert problem={problem} onReload={reload} />
          <FormProblemAlert problem={problem} />
          {props.mode === 'create' && perspective === 'user' && (
            <ClusterTypeahead
              control={form.control}
              granted={granted}
              onValueChange={() => form.setValue('credentialId', '')}
            />
          )}
          {props.mode === 'create' && perspective === 'cluster' && (
            <UserTypeahead control={form.control} granted={granted} />
          )}
          {/* Keyed by cluster, so switching clusters remounts the picker and its one-credential pre-selection. */}
          <CredentialPicker key={clusterName} control={form.control} clusterName={clusterName} />
          <RadioGroupField
            control={form.control}
            name="accessMode"
            label="Access mode"
            isRequired
            options={ACCESS_MODE_OPTIONS}
          />
          {accessMode === 'readWrite' && environment === 'production' && clusterName !== '' && (
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
