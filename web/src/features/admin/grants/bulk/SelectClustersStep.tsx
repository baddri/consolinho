import {
  Button,
  Checkbox,
  EmptyState,
  EmptyStateBody,
  Flex,
  FlexItem,
  SearchInput,
  ToggleGroup,
  ToggleGroupItem,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import { useState } from 'react';
import { useController, type Control } from 'react-hook-form';
import type { ClusterEnvironment, ClusterListItem } from '@/shared/api';
import { matchesText } from '@/shared/table';
import { EnvironmentLabel } from '@/shared/ui';
import { ClusterStatusLabel } from '../../clusters/ClusterStatusLabel';
import type { BulkGrantFormValues } from './bulkGrant.schema';

/** Environment filter choices; `all` shows every cluster. */
const ENVIRONMENT_FILTERS: readonly { value: 'all' | ClusterEnvironment; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
];

/** Props for {@link SelectClustersStep}. */
export interface SelectClustersStepProps {
  control: Control<BulkGrantFormValues>;
  /** Every admin cluster, in display order. */
  clusters: readonly ClusterListItem[];
  /** Number of credentials per cluster name (missing = none). */
  credentialCounts: ReadonlyMap<string, number>;
  /** Clusters the user already has a grant on. */
  granted: ReadonlySet<string>;
}

/** Why a cluster can't be selected, or `undefined` when it can. */
function unavailableReason(name: string, granted: ReadonlySet<string>, counts: ReadonlyMap<string, number>) {
  if (granted.has(name)) return 'already has access';
  if ((counts.get(name) ?? 0) === 0) return 'no credentials';
  return undefined;
}

/**
 * Step 1 of the bulk grant wizard (GRANT-4): a checkbox table of every cluster with environment, status and credential
 * count, filtered by text and environment (local state — the wizard is a modal, so nothing goes to the URL). Clusters
 * the user can already reach ("already has access") or without credentials ("no credentials") stay listed but can't
 * be selected. The header checkbox selects all visible selectable clusters; hidden selections are kept.
 */
export function SelectClustersStep({ control, clusters, credentialCounts, granted }: SelectClustersStepProps) {
  const { field } = useController({ control, name: 'clusters' });
  const [text, setText] = useState('');
  const [environment, setEnvironment] = useState<'all' | ClusterEnvironment>('all');
  const selected = new Set(field.value);

  const visible = clusters.filter(
    (cluster) =>
      (environment === 'all' || cluster.environment === environment) &&
      matchesText(text, cluster.name, cluster.displayName),
  );
  const selectable = visible.filter((cluster) => !unavailableReason(cluster.name, granted, credentialCounts));
  const selectedVisible = selectable.filter((cluster) => selected.has(cluster.name)).length;

  /** Writes the selection back in display order, so the review rows and request items follow the table. */
  const commit = (next: ReadonlySet<string>) =>
    field.onChange(clusters.filter((cluster) => next.has(cluster.name)).map((cluster) => cluster.name));

  const toggle = (name: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(name);
    else next.delete(name);
    commit(next);
  };

  const toggleVisible = (checked: boolean) => {
    const next = new Set(selected);
    for (const cluster of selectable) {
      if (checked) next.add(cluster.name);
      else next.delete(cluster.name);
    }
    commit(next);
  };

  const clearFilters = () => {
    setText('');
    setEnvironment('all');
  };

  return (
    <>
      <Toolbar clearAllFilters={clearFilters}>
        <ToolbarContent>
          <ToolbarItem>
            <SearchInput
              aria-label="Filter clusters by name"
              placeholder="Filter by name"
              value={text}
              onChange={(_event, value) => setText(value)}
              onClear={() => setText('')}
            />
          </ToolbarItem>
          <ToolbarItem>
            <ToggleGroup aria-label="Filter clusters by environment">
              {ENVIRONMENT_FILTERS.map(({ value, label }) => (
                <ToggleGroupItem
                  key={value}
                  text={label}
                  isSelected={environment === value}
                  onChange={() => setEnvironment(value)}
                />
              ))}
            </ToggleGroup>
          </ToolbarItem>
          <ToolbarItem variant="label">{`${field.value.length} selected`}</ToolbarItem>
        </ToolbarContent>
      </Toolbar>
      <Table aria-label="Clusters to grant" variant="compact">
        <Thead>
          <Tr>
            <Th screenReaderText="Select">
              <Checkbox
                id="bulk-grant-select-visible"
                aria-label="Select all visible clusters"
                isChecked={selectedVisible === 0 ? false : selectedVisible === selectable.length ? true : null}
                isDisabled={selectable.length === 0}
                onChange={(_event, checked) => toggleVisible(checked)}
              />
            </Th>
            <Th>Cluster</Th>
            <Th>Status</Th>
            <Th>Credentials</Th>
          </Tr>
        </Thead>
        <Tbody>
          {visible.map((cluster) => {
            const reason = unavailableReason(cluster.name, granted, credentialCounts);
            return (
              <Tr key={cluster.name}>
                <Td>
                  <Checkbox
                    id={`bulk-grant-select-${cluster.name}`}
                    aria-label={`Select ${cluster.name}`}
                    isChecked={selected.has(cluster.name)}
                    isDisabled={reason !== undefined}
                    onChange={(_event, checked) => toggle(cluster.name, checked)}
                  />
                </Td>
                <Td dataLabel="Cluster">
                  <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                    <FlexItem>{cluster.name}</FlexItem>
                    <FlexItem>
                      <EnvironmentLabel environment={cluster.environment} isCompact />
                    </FlexItem>
                    {reason !== undefined && <FlexItem className="pf-v6-u-text-color-subtle">{reason}</FlexItem>}
                  </Flex>
                </Td>
                <Td dataLabel="Status">
                  <ClusterStatusLabel isEnabled={cluster.isEnabled} />
                </Td>
                <Td dataLabel="Credentials">{credentialCounts.get(cluster.name) ?? 0}</Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
      {visible.length === 0 && (
        <EmptyState titleText="No clusters match" headingLevel="h3" variant="sm">
          <EmptyStateBody>
            <Button variant="link" isInline onClick={clearFilters}>
              Clear filters
            </Button>
          </EmptyStateBody>
        </EmptyState>
      )}
    </>
  );
}
