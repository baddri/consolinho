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
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Credential } from '@/shared/api';
import {
  applyServerErrors,
  ChipInputField,
  ConflictAlert,
  FormProblemAlert,
  TextField,
  useFormProblem,
  type FormProblem,
} from '@/shared/forms';
import {
  INSPECT_NAMESPACES_HELPER,
  INSPECT_NAMESPACES_LABEL,
  inspectNamespacesSchema,
  MAX_INSPECT_NAMESPACES,
} from '../connection-test/testConnection.schema';
import { TestProgress } from '../connection-test/TestProgress';
import { TokenTestResult } from '../connection-test/TokenTestResult';
import { useTokenTest } from '../connection-test/useTokenTest';
import { isCredentialGone, useClusterCredentials, useRotateCredentialToken } from './api';
import {
  rotateCredentialSchema,
  TOKEN_HELPER_TEXT,
  tokenSchema,
  type RotateCredentialFormInput,
  type RotateCredentialFormValues,
} from './credentialForm.schema';
import { affectedUsersText, formatInspectNamespaces } from './credentialText';
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
 * "Rotate token" dialog (CRED-5): names credential and cluster, shows the current fingerprint and how many users are
 * affected, and replaces the token in place with the credential's `version`. "Test new token" runs `test-token` with
 * the typed token (T-0038) and the namespaces to inspect, prefilled with the credential's saved list (NST-5); if that test failed, the primary button turns into a danger "Save anyway", and editing
 * the token forgets the result. A stale version (409, e.g. after a connection test) shows `ConflictAlert` and keeps
 * the typed token; "Reload latest values" refetches the credential. The token never leaves this form's state and the
 * request bodies (CRED-2).
 */
export function RotateCredentialModal({ cluster, credential, onClose }: RotateCredentialModalProps) {
  return (
    <CredentialModalFrame
      isOpen
      variant="medium"
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
    defaultValues: { token: '', inspectNamespaces: [...credential.inspectNamespaces] },
  });
  const { problem, handleSubmit, clearProblem } = useFormProblem(form, { listFields: ['inspectNamespaces'] });
  const tokenTest = useTokenTest(cluster.name, credential.id);
  const { clear: clearTokenTest } = tokenTest;
  const [testProblem, setTestProblem] = useState<FormProblem | null>(null);
  const testFailed = tokenTest.result?.succeeded === false;
  const isBusy = form.formState.isSubmitting || tokenTest.isTesting;

  // A result belongs to the token it tested: any edit of the token drops it (and aborts a running test).
  useEffect(
    () =>
      form.subscribe({
        name: 'token',
        exact: true,
        formState: { values: true },
        callback: ({ type }) => {
          // Only typing/pasting counts (`type: 'change'`), not the reset after saving.
          if (type !== 'change') return;
          clearTokenTest();
          setTestProblem(null);
        },
      }),
    [form, clearTokenTest],
  );

  const testNewToken = async () => {
    setTestProblem(null);
    if (!(await form.trigger(['token', 'inspectNamespaces']))) return;
    const token = tokenSchema.safeParse(form.getValues('token'));
    const namespaces = inspectNamespacesSchema.safeParse(form.getValues('inspectNamespaces'));
    if (!token.success || !namespaces.success) return;
    try {
      await tokenTest.run(token.data, namespaces.data);
    } catch (error) {
      setTestProblem(applyServerErrors(error, form, { listFields: ['inspectNamespaces'] }));
    }
  };

  const submit = handleSubmit(async ({ token }) => {
    try {
      const rotated = await rotate({ credentialId: credential.id, token, version: credential.version });
      form.reset({ token: '', inspectNamespaces: [...credential.inspectNamespaces] });
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
            <DescriptionListGroup>
              <DescriptionListTerm>Inspect namespaces</DescriptionListTerm>
              <DescriptionListDescription>{formatInspectNamespaces(credential.inspectNamespaces)}</DescriptionListDescription>
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
          <ChipInputField
            control={form.control}
            name="inspectNamespaces"
            label={INSPECT_NAMESPACES_LABEL}
            helperText={INSPECT_NAMESPACES_HELPER}
            maxItems={MAX_INSPECT_NAMESPACES}
          />
        </Form>
        <div className="pf-v6-u-mt-md" aria-live="polite">
          <FormProblemAlert problem={testProblem} />
          <TestProgress isTesting={tokenTest.isTesting} isCancelled={tokenTest.isCancelled}>
            <Button variant="link" isInline onClick={tokenTest.cancel}>
              Cancel test
            </Button>
          </TestProgress>
          {tokenTest.result !== null && <TokenTestResult result={tokenTest.result} />}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          type="submit"
          form={formId}
          variant={testFailed ? 'danger' : 'primary'}
          isAriaDisabled={isBusy}
          isLoading={form.formState.isSubmitting}
        >
          {testFailed ? 'Save anyway' : 'Rotate'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void testNewToken()}
          isAriaDisabled={isBusy}
          isLoading={tokenTest.isTesting}
        >
          Test new token
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </>
  );
}
