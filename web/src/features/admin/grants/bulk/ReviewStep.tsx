import { Alert, Button, Content, HelperText, HelperTextItem } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useEffect, useRef } from 'react';
import { useController, useFormState, useWatch, type Control } from 'react-hook-form';
import type { ClusterEnvironment, Credential } from '@/shared/api';
import { FormProblemAlert, type FormProblem } from '@/shared/forms';
import { EnvironmentLabel } from '@/shared/ui';
import { CredentialSelect } from '../CredentialPicker';
import {
  ACCESS_MODE_TEXT,
  bulkRowsRefusedText,
  productionClustersWriteWarning,
  withoutBackticks,
  type BulkGrantSubject,
} from '../grantText';
import type { BulkGrantFormValues } from './bulkGrant.schema';

/** Credentials of the fleet grouped by cluster, as the review needs them. */
export interface CredentialsByCluster {
  byCluster: ReadonlyMap<string, readonly Credential[]>;
  isPending: boolean;
  isLoadError: boolean;
}

/** Props for {@link ReviewStep}. */
export interface ReviewStepProps {
  control: Control<BulkGrantFormValues>;
  /** Who gets access; names the production warning and picks the refused-rows advice. */
  subject: BulkGrantSubject;
  /** Environment of each cluster name. */
  environments: ReadonlyMap<string, ClusterEnvironment>;
  credentials: CredentialsByCluster;
  /** What the last submit could not show on a row. */
  problem: FormProblem | null;
  /** Deselects the cluster of row `index` (the "Remove" link of a flagged row). */
  onRemove: (index: number) => void;
}

/** Props for {@link ReviewRow}. */
interface ReviewRowProps {
  control: Control<BulkGrantFormValues>;
  index: number;
  clusterName: string;
  environment: ClusterEnvironment | undefined;
  credentials: CredentialsByCluster;
  onRemove: (index: number) => void;
}

/**
 * One review row: cluster with environment (production rows highlighted), its credential select and the row's errors
 * (zod "Select a credential." or a server error such as "alice already has access to dev-1.", names unquoted). RHF
 * focuses the select through the toggle ref this row owns when the server marks it. A flagged row offers "Remove",
 * which deselects the cluster so the admin can resubmit the rest (GPG-3).
 */
function ReviewRow({ control, index, clusterName, environment, credentials, onRemove }: ReviewRowProps) {
  const { field, fieldState } = useController({ control, name: `items.${index}.credentialId` });
  const { fieldState: clusterState } = useController({ control, name: `items.${index}.clusterName` });
  const toggleRef = useRef<HTMLButtonElement>(null);
  const helperId = `bulk-grant-row-${index}-helper`;
  const errors = [clusterState.error?.message, fieldState.error?.message]
    .filter((message) => message !== undefined)
    .map(withoutBackticks);

  const { ref: registerRef } = field;
  useEffect(() => {
    registerRef({ focus: () => toggleRef.current?.focus() });
  }, [registerRef]);

  return (
    <Tr isRowSelected={environment === 'production'}>
      <Td dataLabel="Cluster">{clusterName}</Td>
      <Td dataLabel="Environment">{environment && <EnvironmentLabel environment={environment} isCompact />}</Td>
      <Td dataLabel="Credential">
        <CredentialSelect
          clusterName={clusterName}
          credentials={credentials.byCluster.get(clusterName) ?? (credentials.isPending ? undefined : [])}
          isPending={credentials.isPending}
          isLoadError={credentials.isLoadError}
          ariaLabel={`Credential for ${clusterName}`}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          toggleRef={toggleRef}
          // Only a credential error marks the select; priority, already-granted or unknown-cluster errors don't.
          isInvalid={fieldState.error !== undefined}
          describedBy={errors.length > 0 ? helperId : undefined}
        />
        {errors.length > 0 && (
          <HelperText id={helperId}>
            {errors.map((message) => (
              <HelperTextItem key={message} variant="error">
                {message}
              </HelperTextItem>
            ))}
          </HelperText>
        )}
        {errors.length > 0 && (
          <Button
            variant="link"
            isInline
            aria-label={`Remove ${clusterName}`}
            onClick={() => onRemove(index)}
          >
            Remove
          </Button>
        )}
      </Td>
    </Tr>
  );
}

/**
 * Step 3 of the bulk grant wizard (GRANT-4): one row per selected cluster in display order, each with a credential
 * select pre-filled by `pickCredential`. Production rows are highlighted; read write with any production row shows a
 * warning naming those clusters. The wizard's "Grant access" stays disabled while a row lacks a credential. Server
 * errors keyed `items[i].…` show on row `i` with a danger alert above the table saying nothing was written and how
 * to go on; anything else in the problem alert.
 */
export function ReviewStep({
  control,
  subject,
  environments,
  credentials,
  problem,
  onRemove,
}: ReviewStepProps) {
  const [items, accessMode] = useWatch({ control, name: ['items', 'accessMode'] });
  const { errors } = useFormState({ control, name: 'items' });
  const hasFlaggedRows = items.some((_, index) => errors.items?.[index] !== undefined);
  const production = items
    .map((item) => item.clusterName)
    .filter((name) => environments.get(name) === 'production');
  const missing = items.filter((item) => item.credentialId === '').length;

  return (
    <>
      <FormProblemAlert problem={problem} />
      {hasFlaggedRows && (
        // `UX.md` §10: spacer--md between the alert and the summary line under it.
        <Alert variant="danger" isInline title={bulkRowsRefusedText(subject.kind)} className="pf-v6-u-mb-md" />
      )}
      <Content component="p">
        {`${ACCESS_MODE_TEXT[accessMode]} access to ${items.length} ${items.length === 1 ? 'cluster' : 'clusters'}.`}
        {missing > 0 && ` Select a credential for ${missing} more ${missing === 1 ? 'cluster' : 'clusters'}.`}
      </Content>
      {accessMode === 'readWrite' && production.length > 0 && (
        <Alert
          variant="warning"
          isInline
          isPlain
          title={productionClustersWriteWarning(subject, production)}
        />
      )}
      <Table aria-label="Clusters to grant access to" variant="compact">
        <Thead>
          <Tr>
            <Th>Cluster</Th>
            <Th>Environment</Th>
            <Th>Credential</Th>
          </Tr>
        </Thead>
        <Tbody>
          {items.map((item, index) => (
            <ReviewRow
              key={item.clusterName}
              control={control}
              index={index}
              clusterName={item.clusterName}
              environment={environments.get(item.clusterName)}
              credentials={credentials}
              onRemove={onRemove}
            />
          ))}
        </Tbody>
      </Table>
    </>
  );
}
