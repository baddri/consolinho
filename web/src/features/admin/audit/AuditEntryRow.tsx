import {
  ClipboardCopy,
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
} from '@patternfly/react-core';
import { ExpandableRowContent, Tbody, Td, Tr } from '@patternfly/react-table';
import { Link } from 'react-router';
import type { AuditEntry } from '@/shared/api';
import { RelativeTime } from '@/shared/ui';
import { proxyOutcome } from './proxyOutcome';

/** Columns of the audit table incl. the expand toggle (for skeleton/empty rows). */
export const AUDIT_COLUMN_COUNT = 7;

/**
 * Pretty-printed `details`, or `undefined` when there is nothing to show. `details` is free-form JSON whose shape
 * depends on the action, so nothing about it is assumed beyond "JSON value": `null`/absent shows nothing.
 */
export function formatDetails(details: unknown): string | undefined {
  if (details === null || details === undefined) return undefined;
  if (typeof details === 'object') return JSON.stringify(details, null, 2);
  // A scalar is not what the contract promises, but shown rather than hidden.
  return JSON.stringify(details);
}

/**
 * Target of a proxied Kubernetes mutation (PAUD-4): the kubectl-style path (`shop/configmaps/web`) in monospace and
 * its outcome label (status code, or "Denied — <reason>"); no label when `details` can't be read.
 */
function KubernetesTarget({ entry }: { entry: AuditEntry }) {
  const outcome = proxyOutcome(entry);
  return (
    <>
      <code>{entry.targetName}</code>{' '}
      {outcome && (
        <Label isCompact color={outcome.color}>
          {outcome.label}
        </Label>
      )}
    </>
  );
}

/** Props for {@link AuditEntryRow}. */
export interface AuditEntryRowProps {
  entry: AuditEntry;
  rowIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * One audit entry (AUD-2) as an expandable composable-table row in its own `Tbody`: time (relative, absolute in a
 * tooltip), actor (a "system" label for configuration changes), monospace action, target type and name, cluster
 * (linked to its admin page — a deleted cluster's link shows the not-found page) and summary. Expanded: the
 * `details` JSON and the copyable correlation id for log lookups.
 */
export function AuditEntryRow({ entry, rowIndex, isExpanded, onToggle }: AuditEntryRowProps) {
  const details = formatDetails(entry.details);

  return (
    <Tbody isExpanded={isExpanded}>
      <Tr>
        <Td expand={{ rowIndex, isExpanded, onToggle, expandId: 'audit-entry' }} />
        <Td dataLabel="Time">
          <RelativeTime value={entry.occurredAt} />
        </Td>
        <Td dataLabel="Actor">
          {entry.actorIsSystem ? (
            <Label isCompact color="purple">
              system
            </Label>
          ) : (
            entry.actor
          )}
        </Td>
        <Td dataLabel="Action">
          <code>{entry.action}</code>
        </Td>
        <Td dataLabel="Target">
          {entry.targetType === 'kubernetesResource' ? (
            <KubernetesTarget entry={entry} />
          ) : (
            <>
              <span className="pf-v6-u-text-color-subtle">{entry.targetType}</span> {entry.targetName}
            </>
          )}
        </Td>
        <Td dataLabel="Cluster">
          {entry.clusterName ? (
            <Link to={`/admin/clusters/${encodeURIComponent(entry.clusterName)}`}>{entry.clusterName}</Link>
          ) : (
            '—'
          )}
        </Td>
        <Td dataLabel="Summary">{entry.summary}</Td>
      </Tr>
      <Tr isExpanded={isExpanded}>
        <Td colSpan={AUDIT_COLUMN_COUNT}>
          {isExpanded && (
            <ExpandableRowContent>
              <DescriptionList isCompact>
                {details !== undefined && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Details</DescriptionListTerm>
                    <DescriptionListDescription>
                      <CodeBlock>
                        <CodeBlockCode>{details}</CodeBlockCode>
                      </CodeBlock>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
                <DescriptionListGroup>
                  <DescriptionListTerm>Correlation ID</DescriptionListTerm>
                  <DescriptionListDescription>
                    {entry.correlationId ? (
                      <ClipboardCopy
                        isReadOnly
                        variant="inline-compact"
                        hoverTip="Copy"
                        clickTip="Copied"
                        aria-label="Correlation ID"
                      >
                        {entry.correlationId}
                      </ClipboardCopy>
                    ) : (
                      '—'
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              </DescriptionList>
            </ExpandableRowContent>
          )}
        </Td>
      </Tr>
    </Tbody>
  );
}
