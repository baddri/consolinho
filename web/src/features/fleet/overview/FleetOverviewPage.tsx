import { Alert, AlertActionLink, Button, Flex, FlexItem } from '@patternfly/react-core';
import { DataViewCheckboxFilter } from '@patternfly/react-data-view';
import { useCallback, useMemo } from 'react';
import { useRecentClusters } from '@/features/cluster-context';
import type { ApiError } from '@/shared/api';
import { PRODUCT_NAME } from '@/shared/branding';
import {
  ConsoleDataView,
  ConsoleEmptyState,
  DataViewTextFilter,
  ErrorState,
  PageBody,
  PageHeading,
  RelativeTime,
} from '@/shared/ui';
import { useFleetRows } from '../api/useFleetRows';
import { fleetColumns } from './fleetColumns';
import { ENVIRONMENT_OPTIONS, matchesFleetFilters, STATUS_OPTIONS, TYPE_OPTIONS } from './fleetFilters';
import { FleetSummary } from './FleetSummary';
import { toTableRows, type FleetStatusKey, type FleetTableRow } from './fleetTableRows';
import { useFleetFilters } from './useFleetFilters';

/** Filter elements (OCP `ConsoleDataView`): Name, then the attribute filters. Module-level, so never recreated. */
const FILTER_NODES = [
  <DataViewTextFilter key="q" filterId="q" title="Name" placeholder="Filter by name" />,
  <DataViewCheckboxFilter
    key="status"
    filterId="status"
    title="Status"
    placeholder="Filter by status"
    options={STATUS_OPTIONS}
  />,
  <DataViewCheckboxFilter
    key="env"
    filterId="env"
    title="Environment"
    placeholder="Filter by environment"
    options={ENVIRONMENT_OPTIONS}
  />,
  <DataViewCheckboxFilter
    key="type"
    filterId="type"
    title="Type"
    placeholder="Filter by type"
    options={TYPE_OPTIONS}
  />,
];

/** Default sort (FLT-5): the Status column sorts by severity, then display name. */
const DEFAULT_SORT = { by: 'status', direction: 'asc' } as const;

const nameOf = (row: FleetTableRow) => row.cluster.name;

/**
 * The stream failed (FLT-6): one title for every cause, the server's ProblemDetails `detail` (e.g. `Fleet.Busy`'s
 * "Try again in a few seconds.") as the body (`UX.md` §10); rows of the last successful run stay below.
 */
function FleetStatusAlert({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <Alert
      variant="danger"
      isInline
      className="pf-v6-u-mb-md"
      title="Could not check the clusters"
      actionLinks={<AlertActionLink onClick={onRetry}>Try again</AlertActionLink>}
    >
      {error.detail ?? error.title}
    </Alert>
  );
}

/**
 * Heading actions: when the last status line arrived (only once a check has run to its end, so the first run doesn't
 * say "now" while Refresh still spins), and Refresh (spinner while a check runs).
 */
function RefreshActions({
  updatedAt,
  hasCompleted,
  isFetching,
  onRefresh,
}: {
  updatedAt: number;
  hasCompleted: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <Flex
      alignItems={{ default: 'alignItemsCenter' }}
      gap={{ default: 'gapMd' }}
      flexWrap={{ default: 'nowrap' }}
    >
      {hasCompleted && updatedAt > 0 && (
        <FlexItem className="pf-v6-u-text-color-subtle pf-v6-u-font-size-sm">
          Last checked <RelativeTime value={new Date(updatedAt).toISOString()} />
        </FlexItem>
      )}
      <FlexItem>
        <Button
          variant="secondary"
          isLoading={isFetching}
          spinnerAriaValueText="Checking clusters"
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </FlexItem>
    </Flex>
  );
}

/**
 * Fleet overview (`/fleet/overview`, FLT-2..FLT-8): one row per cluster the user can access, as an OCP list page
 * (`UX.md` §5, `ConsoleDataView`). Rows show up at once from the cluster list and fill in as their status line
 * streams in (`useFleetRows`); cells render the shared health rules (`shared/health`). Default sort is Status
 * severity, then display name; filters live in the URL (`?q=&status=&env=&type=`) and the summary line sets the
 * Status filter. The stream refreshes every 60 s while visible and on Refresh; a failed check shows an inline alert
 * over the last rows. A Name link opens the cluster's Overview and records it as recent, as the switcher does.
 */
export function FleetOverviewPage() {
  const fleet = useFleetRows();
  const { remember } = useRecentClusters();
  const { values, onFilterChange, clearAll, isFiltered } = useFleetFilters();

  const rows = useMemo(() => toTableRows(fleet.rows), [fleet.rows]);
  const filtered = useMemo(() => rows.filter((row) => matchesFleetFilters(row, values)), [rows, values]);
  const columns = useMemo(() => fleetColumns(remember), [remember]);
  const onStatusFilter = useCallback(
    (statuses: FleetStatusKey[]) => onFilterChange('status', statuses),
    [onFilterChange],
  );

  // Rows come from the cluster list, not the stream: a running refresh must not flip "No clusters" to an empty table.
  const hasNoClusters = !fleet.isLoading && !fleet.clustersError && rows.length === 0;

  return (
    <>
      <PageHeading
        title="Fleet overview"
        actions={
          <RefreshActions
            updatedAt={fleet.dataUpdatedAt}
            hasCompleted={fleet.hasCompleted}
            isFetching={fleet.isFetching}
            onRefresh={fleet.refetch}
          />
        }
      />
      <PageBody>
        {fleet.error && <FleetStatusAlert error={fleet.error} onRetry={fleet.refetch} />}
        {hasNoClusters ? (
          <ConsoleEmptyState title="No clusters" headingLevel="h2">
            You don&apos;t have access to any cluster. Ask a {PRODUCT_NAME} administrator for access.
          </ConsoleEmptyState>
        ) : (
          <>
            {rows.length > 0 && <FleetSummary rows={rows} onStatusFilter={onStatusFilter} />}
            <ConsoleDataView
              id="fleet-overview"
              label="clusters"
              data={rows}
              filteredData={filtered}
              loaded={!fleet.isLoading}
              error={
                fleet.clustersError &&
                rows.length === 0 && (
                  <ErrorState
                    error={fleet.clustersError}
                    title="Could not load clusters"
                    onRetry={fleet.refetchClusters}
                  />
                )
              }
              columns={columns}
              getRowId={nameOf}
              defaultSort={DEFAULT_SORT}
              filterNodes={FILTER_NODES}
              filterValues={values}
              onFilterChange={onFilterChange}
              onClearAllFilters={clearAll}
              isFiltered={isFiltered}
            />
          </>
        )}
      </PageBody>
    </>
  );
}
