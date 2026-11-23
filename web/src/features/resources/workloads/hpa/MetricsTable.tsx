import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { HorizontalPodAutoscaler } from '@/shared/k8s';
import { ObjectReferenceLink } from '../../components/ObjectReferenceLink';
import { metricRows, type MetricRow } from './metrics';

/** Type cell: the metric label, "<name> on <link>" for Object metrics, and OCP's small subtle hint when there is one. */
function MetricType({ row, namespace }: { row: MetricRow; namespace: string | undefined }) {
  return (
    <>
      {row.describedObject ? (
        <>
          {row.type} on{' '}
          <ObjectReferenceLink
            apiVersion={row.describedObject.apiVersion}
            kind={row.describedObject.kind}
            name={row.describedObject.name}
            namespace={namespace}
          />
        </>
      ) : (
        row.type
      )}
      {row.hint && (
        <>
          {' '}
          <span className="pf-v6-u-font-size-xs pf-v6-u-text-color-subtle">{row.hint}</span>
        </>
      )}
    </>
  );
}

/**
 * The HPA's Metrics table, OCP `hpa.tsx` `MetricsTable`: Type (50 %), Current and Target (25 % each), one row per
 * `spec.metrics[]` ({@link metricRows}); "-" for a value the HPA hasn't reported. The "Metrics" heading is the
 * surrounding `DetailsSubsection`'s.
 */
export function MetricsTable({ hpa }: { hpa: HorizontalPodAutoscaler }) {
  const namespace = hpa.metadata?.namespace;
  return (
    <Table aria-label="Metrics" gridBreakPoint="">
      <Thead>
        <Tr>
          <Th width={50}>Type</Th>
          <Th width={25}>Current</Th>
          <Th width={25}>Target</Th>
        </Tr>
      </Thead>
      <Tbody>
        {metricRows(hpa).map((row) => (
          <Tr key={row.key}>
            <Td dataLabel="Type" width={50}>
              <MetricType row={row} namespace={namespace} />
            </Td>
            <Td dataLabel="Current" width={25}>
              {row.current ?? '-'}
            </Td>
            <Td dataLabel="Target" width={25}>
              {row.target ?? '-'}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
