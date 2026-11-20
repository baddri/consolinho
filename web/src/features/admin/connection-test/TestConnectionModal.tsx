import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  AlertActionLink,
  Button,
  Divider,
  Form,
  ModalBody,
  ModalFooter,
  Skeleton,
} from '@patternfly/react-core';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { errorMessage, isAbortError, type ClusterDetail, type ConnectionTestResult, type Credential } from '@/shared/api';
import { FormProblemAlert, SelectField, TextField, useFormProblem } from '@/shared/forms';
import { useToast } from '@/shared/ui';
import { useClusterCredentials } from '../credentials/api';
import { CredentialModalFrame } from '../credentials/CredentialModalFrame';
import { useTestCredential } from './api';
import { ConnectionTestResultView } from './ConnectionTestResultView';
import {
  testConnectionSchema,
  type TestConnectionFormInput,
  type TestConnectionFormValues,
} from './testConnection.schema';
import { TestProgress } from './TestProgress';
import { useTestCancellation } from './useTestCancellation';

/** Why "Test connection" is disabled for a cluster without credentials (TEST-1). */
export const NO_CREDENTIALS_REASON = 'Add a credential first';

/**
 * The cluster a test runs on: name and environment for the dialog header; `isEnabled` (when the caller knows it)
 * adds the note that tests also run on disabled clusters.
 */
export type TestConnectionCluster = Pick<ClusterDetail, 'name' | 'environment'> & { isEnabled?: boolean };

/** Props for {@link TestConnectionModal}. */
export interface TestConnectionModalProps {
  cluster: TestConnectionCluster;
  /** Credential pre-selected in the picker (credential kebab "Test"); else the only one, if there is exactly one. */
  initialCredentialId?: string;
  onClose: () => void;
}

/**
 * "Test connection" dialog (TEST-1..5): pick one of the cluster's stored credentials (loaded with the shared
 * credentials query), optionally a namespace to inspect, and run the stored test. While it runs the dialog shows the
 * progress text and "Cancel test" (aborts the request); closing aborts too. The result renders below the form
 * ({@link ConnectionTestResultView}), a toast names credential and cluster, and the admin lists refresh so the
 * "Last test" cells update (TEST-5). Works on disabled clusters.
 */
export function TestConnectionModal({ cluster, initialCredentialId, onClose }: TestConnectionModalProps) {
  return (
    <CredentialModalFrame
      isOpen
      variant="medium"
      title={`Test connection to ${cluster.name}`}
      cluster={cluster}
      onClose={onClose}
    >
      <TestConnectionBody cluster={cluster} initialCredentialId={initialCredentialId} onClose={onClose} />
    </CredentialModalFrame>
  );
}

/** Loading / error / empty states around {@link TestConnectionForm}. */
function TestConnectionBody({ cluster, initialCredentialId, onClose }: TestConnectionModalProps) {
  const credentials = useClusterCredentials(cluster.name);
  let content;
  if (credentials.isPending) {
    content = <Skeleton screenreaderText="Loading credentials" />;
  } else if (credentials.data === undefined) {
    // Only when nothing was ever loaded: a failed background refetch keeps the form (and a shown result) mounted.
    content = (
      <Alert
        variant="danger"
        isInline
        title={errorMessage(credentials.error)}
        actionLinks={<AlertActionLink onClick={() => void credentials.refetch()}>Retry</AlertActionLink>}
      />
    );
  } else if (credentials.data.length === 0) {
    content = <Alert variant="info" isInline title={`${NO_CREDENTIALS_REASON}: ${cluster.name} has no credentials.`} />;
  } else {
    return (
      <TestConnectionForm
        cluster={cluster}
        credentials={credentials.data}
        initialCredentialId={initialCredentialId}
        onClose={onClose}
      />
    );
  }
  return (
    <>
      <ModalBody>{content}</ModalBody>
      <ModalFooter>
        <Button variant="link" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </>
  );
}

/** The picker form, progress, result and footer; owns the form state and the running test. */
function TestConnectionForm({
  cluster,
  credentials,
  initialCredentialId,
  onClose,
}: TestConnectionModalProps & { credentials: readonly Credential[] }) {
  const formId = useId();
  const toast = useToast();
  const test = useTestCredential(cluster.name);
  const cancellation = useTestCancellation();
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const preselected = initialCredentialId ?? (credentials.length === 1 ? credentials[0]?.id : undefined);
  const form = useForm<TestConnectionFormInput, unknown, TestConnectionFormValues>({
    resolver: zodResolver(testConnectionSchema),
    defaultValues: { credentialId: preselected ?? '', inspectNamespace: '' },
  });
  const { problem, handleSubmit } = useFormProblem(form);
  const isTesting = form.formState.isSubmitting;

  const submit = handleSubmit(async ({ credentialId, inspectNamespace }) => {
    setResult(null);
    setIsCancelled(false);
    try {
      const tested = await test.mutateAsync({ credentialId, inspectNamespace, signal: cancellation.start() });
      setResult(tested);
      const name = credentials.find((credential) => credential.id === credentialId)?.name ?? 'the credential';
      const outcome = tested.succeeded ? 'passed' : 'failed';
      const notify = tested.succeeded ? toast.success : toast.danger;
      notify(`Connection test ${outcome} for ${name} on ${cluster.name}`);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    }
  });

  return (
    <>
      <ModalBody>
        <Form id={formId} noValidate onSubmit={(event) => void submit(event)}>
          {cluster.isEnabled === false && (
            <Alert
              variant="info"
              isInline
              isPlain
              title={`${cluster.name} is disabled. Connection tests still run, so you can check it before enabling it.`}
            />
          )}
          {/* A 409 here means the credential was rotated meanwhile: the lists refresh, running again is enough. */}
          <FormProblemAlert problem={problem && { ...problem, isConflict: false }} />
          <SelectField
            control={form.control}
            name="credentialId"
            label="Credential"
            isRequired
            placeholder="Select a credential"
            options={credentials.map((credential) => ({ value: credential.id, label: credential.name }))}
          />
          <TextField
            control={form.control}
            name="inspectNamespace"
            label="Inspect namespace"
            helperText="Optional. Also lists what the credential may do in this namespace."
            spellCheck={false}
          />
        </Form>
        {/* Always mounted, so "Testing…" and "Test cancelled." are announced when they appear. */}
        <div className="pf-v6-u-mt-md" aria-live="polite">
          <TestProgress isTesting={isTesting} isCancelled={isCancelled} />
        </div>
        {result !== null && (
          <>
            <Divider className="pf-v6-u-my-md" />
            <ConnectionTestResultView result={result} />
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button type="submit" form={formId} isAriaDisabled={isTesting} isLoading={isTesting}>
          Run test
        </Button>
        {isTesting ? (
          <Button
            variant="link"
            onClick={() => {
              cancellation.cancel();
              setIsCancelled(true);
            }}
          >
            Cancel test
          </Button>
        ) : (
          <Button variant="link" onClick={onClose}>
            Close
          </Button>
        )}
      </ModalFooter>
    </>
  );
}
