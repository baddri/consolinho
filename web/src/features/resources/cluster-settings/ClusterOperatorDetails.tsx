import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { clusterOperatorStatusAndMessage } from '@/shared/health';
import type { ClusterOperator } from '@/shared/k8s';
import { ConsoleEmptyState, DASH, DetailsItem, DetailsSubsection } from '@/shared/ui';
import { ConditionsTable } from '../components/ConditionsTable';
import { ClusterOperatorStatusLabel } from './ClusterOperatorStatusLabel';
import styles from './ClusterSettings.module.css';

/**
 * Right column of "ClusterOperator details" (OCP `cluster-operator.tsx` `ClusterOperatorDetails`): Version — only when
 * the operator reports a single `operator` version, as OCP — then Status and Message (pre-line, "-" without one).
 */
export function ClusterOperatorDetails({ obj }: { obj: ClusterOperator }) {
  const { status, message } = clusterOperatorStatusAndMessage(obj);
  const versions = obj.status?.versions ?? [];
  const [only] = versions;
  const operatorVersion = versions.length === 1 && only?.name === 'operator' ? only.version : undefined;
  return (
    <>
      {operatorVersion && <DetailsItem label="Version">{operatorVersion}</DetailsItem>}
      <DetailsItem label="Status">
        <ClusterOperatorStatusLabel status={status} />
      </DetailsItem>
      <DetailsItem label="Message">
        <span className={styles.preLine}>{message ?? DASH}</span>
      </DetailsItem>
    </>
  );
}

/** "Operand versions" (OCP `OperandVersions`): compact Name / Version table of `status.versions`. */
function OperandVersions({ obj }: { obj: ClusterOperator }) {
  const versions = obj.status?.versions ?? [];
  if (versions.length === 0) return <ConsoleEmptyState>No versions found</ConsoleEmptyState>;
  return (
    <Table aria-label="Operand versions" variant="compact" gridBreakPoint="">
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Version</Th>
        </Tr>
      </Thead>
      <Tbody>
        {versions.map(({ name, version }) => (
          <Tr key={name}>
            <Td dataLabel="Name">{name}</Td>
            <Td dataLabel="Version">{version}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/** Sections under the ClusterOperator details grid, as OCP: Conditions, then Operand versions. */
export function ClusterOperatorSections({ obj }: { obj: ClusterOperator }) {
  return (
    <>
      <DetailsSubsection title="Conditions">
        <ConditionsTable conditions={obj.status?.conditions} />
      </DetailsSubsection>
      <DetailsSubsection title="Operand versions">
        <OperandVersions obj={obj} />
      </DetailsSubsection>
    </>
  );
}
