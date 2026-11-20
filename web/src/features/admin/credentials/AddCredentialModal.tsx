import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, ModalBody, ModalFooter } from '@patternfly/react-core';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { FormProblemAlert, TextAreaField, TextField, useFormProblem } from '@/shared/forms';
import { useAddCredential } from './api';
import {
  ADD_CREDENTIAL_DEFAULTS,
  addCredentialSchema,
  TOKEN_HELPER_TEXT,
  type AddCredentialFormInput,
  type AddCredentialFormValues,
} from './credentialForm.schema';
import { CredentialModalFrame, type CredentialCluster } from './CredentialModalFrame';
import { useCredentialSavedToast } from './useCredentialSavedToast';

/** Props for {@link AddCredentialModal}. */
export interface AddCredentialModalProps {
  isOpen: boolean;
  cluster: CredentialCluster;
  onClose: () => void;
}

/**
 * "Add credential" dialog (CRED-1): name, optional description and the ServiceAccount token in a masked password
 * input with a reveal toggle. The token lives only in this form's state (CRED-2): the form mounts only while open and
 * is reset after success. Server 400s land on their fields, 409 `Credentials.NameTaken` on the name. Success toasts;
 * an opaque token adds the Q10 warning toast.
 */
export function AddCredentialModal({ isOpen, cluster, onClose }: AddCredentialModalProps) {
  return (
    <CredentialModalFrame isOpen={isOpen} title={`Add credential to ${cluster.name}`} cluster={cluster} onClose={onClose}>
      <AddCredentialForm cluster={cluster} onClose={onClose} />
    </CredentialModalFrame>
  );
}

/** Body and footer of {@link AddCredentialModal}; owns the form state. */
function AddCredentialForm({ cluster, onClose }: Omit<AddCredentialModalProps, 'isOpen'>) {
  const formId = useId();
  const addCredential = useAddCredential(cluster.name);
  const notifySaved = useCredentialSavedToast();
  const form = useForm<AddCredentialFormInput, unknown, AddCredentialFormValues>({
    resolver: zodResolver(addCredentialSchema),
    defaultValues: ADD_CREDENTIAL_DEFAULTS,
  });
  const { problem, handleSubmit } = useFormProblem(form, { codeToField: { 'Credentials.NameTaken': 'name' } });

  const submit = handleSubmit(async (values) => {
    const credential = await addCredential(values);
    form.reset(ADD_CREDENTIAL_DEFAULTS);
    notifySaved(credential, `Credential ${credential.name} added to ${cluster.name}`);
    onClose();
  });

  return (
    <>
      <ModalBody>
        <Form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <FormProblemAlert problem={problem} />
          <TextField
            control={form.control}
            name="name"
            label="Name"
            isRequired
            helperText="Unique on this cluster, e.g. fleet-view."
            autoComplete="off"
            spellCheck={false}
          />
          <TextAreaField control={form.control} name="description" label="Description" resizeOrientation="vertical" />
          <TextField
            control={form.control}
            name="token"
            label="Token"
            type="password"
            isRequired
            helperText={TOKEN_HELPER_TEXT}
            spellCheck={false}
          />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form={formId}
          isAriaDisabled={form.formState.isSubmitting}
          isLoading={form.formState.isSubmitting}
        >
          Add
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </>
  );
}
