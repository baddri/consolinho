import { Alert, Stack, StackItem } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { NamespaceRules } from '@/shared/api';

/** Shown when the cluster flagged its rule list as incomplete (TEST-3). */
export const INCOMPLETE_RULES_TEXT = 'The cluster reported an incomplete rule list.';

/** Comma-separated list, or a subtle dash for an empty one. */
function joined(values: readonly string[], empty = '—'): string {
  return values.length === 0 ? empty : values.join(', ');
}

/**
 * The credential's RBAC rules in one namespace (TEST-3 "inspect namespace"), from `SelfSubjectRulesReview`: one row
 * per rule with verbs, API groups (`""` shown as "core"), resources and resource names (empty = all). An incomplete
 * list adds a warning; the cluster's `evaluationError` is shown verbatim.
 */
export function NamespaceRulesTable({ rules }: { rules: NamespaceRules }) {
  // A reviewed entry always has rules; an error entry is rendered by the caller instead (NST-3).
  const list = rules.rules ?? [];
  return (
    <Stack hasGutter>
      {rules.incomplete && (
        <StackItem>
          <Alert variant="warning" isInline isPlain title={INCOMPLETE_RULES_TEXT} />
        </StackItem>
      )}
      {rules.evaluationError !== null && (
        <StackItem>
          <Alert variant="warning" isInline isPlain title="Evaluation error">
            {rules.evaluationError}
          </Alert>
        </StackItem>
      )}
      <StackItem>
        <Table variant="compact" aria-label={`Rules in namespace ${rules.namespace}`}>
          <Thead>
            <Tr>
              <Th>Verbs</Th>
              <Th>API groups</Th>
              <Th>Resources</Th>
              <Th>Names</Th>
            </Tr>
          </Thead>
          <Tbody>
            {list.length === 0 && (
              <Tr>
                <Td colSpan={4}>No rules in this namespace.</Td>
              </Tr>
            )}
            {list.map((rule, index) => (
              // Rules have no identity; the server's order is stable for one result.
              <Tr key={index}>
                <Td dataLabel="Verbs">{joined(rule.verbs)}</Td>
                <Td dataLabel="API groups">{joined(rule.apiGroups.map((group) => (group === '' ? 'core' : group)))}</Td>
                <Td dataLabel="Resources">{joined(rule.resources)}</Td>
                <Td dataLabel="Names">{joined(rule.resourceNames, 'All')}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </StackItem>
    </Stack>
  );
}
