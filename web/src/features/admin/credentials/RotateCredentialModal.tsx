import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Form,
  ModalBody,
  ModalFooter,
} from '@patternfly/react-core';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import type { Credential } from '@/shared/api';
import { ConflictAlert, FormProblemAlert, TextField, useFormProblem } from '@/shared/forms';
import { isCredentialGone, useClusterCredentials, useRotateCredentialToken } from './api';
import {
  rotateCredentialSchema,
  TOKEN_HELPER_TEXT,
  type RotateCredentialFormInput,
  type RotateCredentialFormValues,
} from './credentialForm.schema';
import { affectedUsersText } from './credentialText';
import { CredentialModalFrame, type CredentialCluster } from './CredentialModalFrame';
import { useCredentialGoneToast } from './useCredentialGoneToast';
import { useCredentialSavedToast } from './useCredentialSavedToast';

/** Props for {@link RotateCredentialModal}. */
export interface RotateCredentialModalProps {
  cluster: CredentialCluster;
  /** The credential to rotate, kept current by the caller (its `version` is sent when submitting). */
  credential: Credential;
  onClose: () => void;
}

/**
 * "Rotate token" dialog (CRED-5 without "Test new token", which T-0038 adds to the footer): names credential and
 * cluster, shows the current fingerprint and how many users are affected, and replaces the token in place with the
 * credential's `version`. A stale version (409, e.g. after a connection test) shows `ConflictAlert` and keeps the
 * typed token; "Reload latest values" refetches the credential. The token never leaves this form's state (CRED-2).
 */
export function RotateCredentialModal({ cluster, credential, onClose }: RotateCredentialModalProps) {
  return (
    <CredentialModalFrame
      isOpen
      title={`Rotate token of ${credential.name} on ${cluster.name}`}
      cluster={cluster}
      onClose={onClose}
    >
      <RotateCredentialForm cluster={cluster} credential={credential} onClose={onClose} />
    </CredentialModalFrame>
  );
}

/** Body and footer of {@link RotateCredentialModal}; owns the form state. */
function RotateCredentialForm({ cluster, credential, onClose }: RotateCredentialModalProps) {
  const formId = useId();
  const rotate = useRotateCredentialToken(cluster.name);
  const credentials = useClusterCredentials(cluster.name);
  const notifySaved = useCredentialSavedToast();
  const notifyGone = useCredentialGoneToast();
  const form = useForm<RotateCredentialFormInput, unknown, RotateCredentialFormValues>({
    resolver: zodResolver(rotateCredentialSchema),
    defaultValues: { token: '' },
  });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form);

  const submit = handleSubmit(async ({ token }) => {
    try {
      const rotated = await rotate({ credentialId: credential.id, token, version: credential.version });
      form.reset({ token: '' });
      notifySaved(rotated, `Token of ${rotated.name} on ${cluster.name} rotated`);
      onClose();
    } catch (error) {
      if (!isCredentialGone(error)) throw error;
      notifyGone(credential.name, cluster.name);
      onClose();
    }
  });

  const reload = () => {
    void credentials.refetch().then(clearProblem);
  };

  return (
    <>
      <ModalBody>
        <Form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <ConflictAlert problem={problem} onReload={reload} isReloading={credentials.isFetching} />
          <FormProblemAlert problem={problem} />
          <DescriptionList isHorizontal isCompact aria-label="Credential to rotate">
            <DescriptionListGroup>
              <DescriptionListTerm>Current fingerprint</DescriptionListTerm>
              <DescriptionListDescription className="pf-v6-u-font-family-monospace">
                {credential.fingerprint}
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
          <Content component="p">
            {`${affectedUsersText(credential.grantCount)} Grants keep using this credential with the new token.`}
          </Content>
          <TextField
            control={form.control}
            name="token"
            label="New token"
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
          Rotate
        </Button>
        {/* T-0038 adds the secondary "Test new token" button here. */}
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </>
  );
}
