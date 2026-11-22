import { Button, Content, Flex, FlexItem, List, ListItem, Stack, StackItem } from '@patternfly/react-core';
import { Table, Tbody, Th, Thead, Tr } from '@patternfly/react-table';
import { useMemo, useState, type ReactNode } from 'react';
import { isApiError, type ApiError, type AuditEntry, type AuditPage } from '@/shared/api';
import { LOW_PRIORITY_COLUMN, TableEmptyRow, TableNoMatchRow, TableSkeletonRows } from '@/shared/table';
import { ErrorState, PageBody, PageHeading } from '@/shared/ui';
import { useAuditLog } from './api';
import { AuditFilters } from './AuditFilters';
import { AUDIT_COLUMN_COUNT, AUDIT_COLUMN_VISIBILITY, AuditEntryRow } from './AuditEntryRow';
import { auditFiltersKey, useAuditFilters, useAuditRequest, type AuditFilterValues } from './auditFilters';

/** Entries of all loaded pages in order, dropping any id already seen (keyset paging shouldn't repeat; be safe). */
function flattenPages(pages: readonly AuditPage[] | undefined): AuditEntry[] {
  const seen = new Set<string>();
  const entries: AuditEntry[] = [];
  for (const page of pages ?? []) {
    for (const entry of page.items) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  return entries;
}

/** Ids of the expanded rows; toggling one keeps the others. */
function useExpandedRows() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { isExpanded: (id: string) => expanded.has(id), toggle };
}

/**
 * `/fleet/admin/audit` — the audit log viewer (AUD-2, AUD-4, AUD-5): a filterable, linkable history of admin and auth
 * events, newest first. Filters live in the URL (`?actor=&user=&category=&cluster=&target=&range=&from=&to=`, see
 * `auditFilters.ts`), so the "View audit entries" links of the user and cluster pages land pre-filtered. The results
 * remount per filter set (fresh `now` for preset ranges, collapsed rows). Read-only: no mutating controls (AUD-3),
 * available to read-only admins (AUD-5). Lazy-loaded by `routes.tsx`.
 */
export function AuditLogPage() {
  const filters = useAuditFilters();

  return (
    <>
      <PageHeading
        title="Audit log"
        subtitle="Who changed users, clusters, credentials and grants, and who logged in — newest first."
      />
      <PageBody>
        <AuditFilters filters={filters} />
        <AuditResults
          key={auditFiltersKey(filters.values)}
          values={filters.values}
          isFiltered={filters.activeCount > 0}
          onClearFilters={filters.clearAll}
        />
      </PageBody>
    </>
  );
}

/** Props for {@link AuditResults}. */
interface AuditResultsProps {
  values: AuditFilterValues;
  isFiltered: boolean;
  onClearFilters: () => void;
}

/**
 * Table and footer of one filter set: loads pages by keyset cursor with "Load more" under a stable query key (the
 * resolved request, `now` captured on mount), with skeleton, empty, invalid-filter (400) and error states.
 */
function AuditResults({ values, isFiltered, onClearFilters }: AuditResultsProps) {
  const request = useAuditRequest(values);
  const { data, error, isPending, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError } =
    useAuditLog(request);
  const { isExpanded, toggle } = useExpandedRows();

  const entries = useMemo(() => flattenPages(data?.pages), [data]);
  const clearFiltersButton = (
    <Button variant="link" onClick={onClearFilters}>
      Clear all filters
    </Button>
  );

  if (data === undefined && error) {
    return isApiError(error) && error.status === 400 ? (
      <InvalidFiltersState error={error} actions={clearFiltersButton} />
    ) : (
      <ErrorState error={error} title="Could not load the audit log" onRetry={() => void refetch()} />
    );
  }

  return (
    <>
      <Table aria-label="Audit log" variant="compact">
        <Thead>
          <Tr>
            {/* Fixed widths: the header keeps its layout when the body is only an empty-state row; the expand toggle
                column takes only its content width, as PF expandable tables. */}
            <Th screenReaderText="Row expansion" />
            <Th modifier="nowrap" width={15}>
              Time
            </Th>
            <Th modifier="nowrap" width={15}>
              Actor
            </Th>
            <Th modifier="nowrap" width={20}>
              Action
            </Th>
            <Th modifier="nowrap" visibility={LOW_PRIORITY_COLUMN}>
              Target
            </Th>
            <Th modifier="nowrap" visibility={LOW_PRIORITY_COLUMN}>
              Cluster
            </Th>
            <Th modifier="nowrap">Summary</Th>
          </Tr>
        </Thead>
        {isPending && (
          <Tbody>
            <TableSkeletonRows columns={AUDIT_COLUMN_COUNT} columnVisibility={AUDIT_COLUMN_VISIBILITY} />
          </Tbody>
        )}
        {data && entries.length === 0 && (
          <Tbody>
            {isFiltered ? (
              <TableNoMatchRow colSpan={AUDIT_COLUMN_COUNT} onClearAll={onClearFilters} />
            ) : (
              <TableEmptyRow colSpan={AUDIT_COLUMN_COUNT} title="No audit entries found" />
            )}
          </Tbody>
        )}
        {entries.map((entry, rowIndex) => (
          <AuditEntryRow
            key={entry.id}
            entry={entry}
            rowIndex={rowIndex}
            isExpanded={isExpanded(entry.id)}
            onToggle={() => toggle(entry.id)}
          />
        ))}
      </Table>
      {entries.length > 0 && (
        <Stack hasGutter className="pf-v6-u-mt-md">
          {isFetchNextPageError && (
            <StackItem>
              <ErrorState error={error} title="Could not load more entries" onRetry={() => void fetchNextPage()} />
            </StackItem>
          )}
          <StackItem>
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <Content component="small">
                  Showing {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                </Content>
              </FlexItem>
              <FlexItem>
                {hasNextPage ? (
                  <Button
                    variant="secondary"
                    isLoading={isFetchingNextPage}
                    isDisabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    Load more
                  </Button>
                ) : (
                  <Content component="small">End of audit log</Content>
                )}
              </FlexItem>
            </Flex>
          </StackItem>
        </Stack>
      )}
    </>
  );
}

/**
 * A 400 for the current filters (e.g. a hand-edited `from`): the server's detail, its field errors and
 * "Clear all filters".
 */
function InvalidFiltersState({ error, actions }: { error: ApiError; actions: ReactNode }) {
  const fieldErrors = Object.entries(error.fieldErrors);
  return (
    <Stack hasGutter>
      <StackItem>
        <ErrorState error={error} title="These filters are not valid" />
      </StackItem>
      {fieldErrors.length > 0 && (
        <StackItem>
          <List aria-label="Filter errors">
            {fieldErrors.map(([field, messages]) => (
              <ListItem key={field}>
                <code>{field}</code>: {messages.join(' ')}
              </ListItem>
            ))}
          </List>
        </StackItem>
      )}
      <StackItem>{actions}</StackItem>
    </Stack>
  );
}
