import { Alert, Content, HelperText, HelperTextItem } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useEffect, useRef } from 'react';
import { useController, useWatch, type Control } from 'react-hook-form';
import type { ClusterEnvironment, Credential } from '@/shared/api';
import { FormProblemAlert, type FormProblem } from '@/shared/forms';
import { EnvironmentLabel } from '@/shared/ui';
import { CredentialSelect } from '../CredentialPicker';
import { ACCESS_MODE_TEXT, productionClustersWriteWarning } from '../grantText';
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
  /** Environment of each cluster name. */
  environments: ReadonlyMap<string, ClusterEnvironment>;
  credentials: CredentialsByCluster;
  /** What the last submit could not show on a row. */
  problem: FormProblem | null;
}

/** Props for {@link ReviewRow}. */
interface ReviewRowProps {
  control: Control<BulkGrantFormValues>;
  index: number;
  clusterName: string;
  environment: ClusterEnvironment | undefined;
  credentials: CredentialsByCluster;
}

/**
 * One review row: cluster with environment (production rows highlighted), its credential select and the row's errors
 * (zod "Select a credential." or a server error such as "alice already has access to dev-1."). RHF focuses the
 * select through the toggle ref this row owns when the server marks it.
 */
function ReviewRow({ control, index, clusterName, environment, credentials }: ReviewRowProps) {
  const { field, fieldState } = useController({ control, name: `items.${index}.credentialId` });
  const { fieldState: clusterState } = useController({ control, name: `items.${index}.clusterName` });
  const toggleRef = useRef<HTMLButtonElement>(null);
  const helperId = `bulk-grant-row-${index}-helper`;
  const errors = [clusterState.error?.message, fieldState.error?.message].filter((message) => message !== undefined);

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
          isInvalid={errors.length > 0}
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
      </Td>
    </Tr>
  );
}

/**
 * Step 3 of the bulk grant wizard (GRANT-4): one row per selected cluster in display order, each with a credential
 * select pre-filled by `pickCredential`. Production rows are highlighted; read write with any production row shows a
 * warning naming those clusters. The wizard's "Grant access" stays disabled while a row lacks a credential. Server
 * errors keyed `items[i].…` show on row `i`; anything else in the alert above the table.
 */
export function ReviewStep({ control, environments, credentials, problem }: ReviewStepProps) {
  const [items, accessMode] = useWatch({ control, name: ['items', 'accessMode'] });
  const production = items
    .map((item) => item.clusterName)
    .filter((name) => environments.get(name) === 'production');
  const missing = items.filter((item) => item.credentialId === '').length;

  return (
    <>
      <FormProblemAlert problem={problem} />
      <Content component="p">
        {`${ACCESS_MODE_TEXT[accessMode]} access to ${items.length} ${items.length === 1 ? 'cluster' : 'clusters'}.`}
        {missing > 0 && ` Select a credential for ${missing} more ${missing === 1 ? 'cluster' : 'clusters'}.`}
      </Content>
      {accessMode === 'readWrite' && production.length > 0 && (
        <Alert variant="warning" isInline isPlain title={productionClustersWriteWarning(production)} />
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
            />
          ))}
        </Tbody>
      </Table>
    </>
  );
}
