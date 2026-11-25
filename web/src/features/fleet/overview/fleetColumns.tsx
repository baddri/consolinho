import { Label } from '@patternfly/react-core';
import type { ComponentType, ReactNode } from 'react';
import { clusterVersionText } from '@/shared/health';
import { LOW_PRIORITY_COLUMN } from '@/shared/table';
import { clusterTypeText, DASH, EnvironmentLabel, Timestamp, type DataViewColumn } from '@/shared/ui';
import { ClusterNameCell } from './cells/ClusterNameCell';
import { ClusterStatusCell } from './cells/ClusterStatusCell';
import {
  NodesCell,
  OperatorsCell,
  UpdateCell,
  VersionCell,
  type StatusLineCellProps,
} from './cells/sectionCells';
import { statusSortValue, type FleetTableRow } from './fleetTableRows';

/** Keeps a health cell on one line: the table hides columns rather than wrapping them (`UX.md` §5). */
function NoWrap({ children }: { children: ReactNode }) {
  return <div className="pf-v6-u-text-nowrap">{children}</div>;
}

/**
 * A cell that needs the row's status line: empty while it is being checked, "—" when it never arrived. One line
 * unless `wrap`.
 */
function lineCell(
  Cell: ComponentType<StatusLineCellProps>,
  { wrap = false }: { wrap?: boolean } = {},
): (row: FleetTableRow) => ReactNode {
  return function LineCell(row) {
    if (row.status) {
      const cell = <Cell status={row.status} />;
      return wrap ? cell : <NoWrap>{cell}</NoWrap>;
    }
    return row.pending ? null : DASH;
  };
}

/**
 * Columns of the fleet table (FLT-2/FLT-3) for `ConsoleDataView`. `onOpen` records the cluster a Name link opens
 * (FLT-8). Fits the pane without sideways scrolling (`UX.md` §5): Update, Environment, Type and Access hide below
 * `2xl`, Last checked is an additional column (the heading says when the fleet was checked), health cells stay on
 * one line except Operators, and every column has a minimum width.
 */
export function fleetColumns(onOpen: (name: string) => void): DataViewColumn<FleetTableRow>[] {
  return [
    {
      id: 'name',
      width: 200,
      title: 'Name',
      type: 'name',
      cell: (row) => <ClusterNameCell cluster={row.cluster} onOpen={onOpen} />,
      sortValue: (row) => row.cluster.displayName,
    },
    {
      id: 'status',
      width: 150,
      title: 'Status',
      cell: (row) => (
        <NoWrap>
          <ClusterStatusCell row={row} />
        </NoWrap>
      ),
      sortValue: statusSortValue,
    },
    {
      id: 'version',
      width: 110,
      title: 'Version',
      cell: lineCell(VersionCell),
      sortValue: (row) => (row.status ? (clusterVersionText(row.status) ?? null) : null),
    },
    {
      id: 'update',
      width: 170,
      title: 'Update',
      visibility: LOW_PRIORITY_COLUMN,
      cell: lineCell(UpdateCell),
    },
    {
      id: 'operators',
      // The only health cell allowed to wrap ("1 degraded," / "0 unavailable"), so the table fits 1280.
      width: 120,
      title: 'Operators',
      cell: lineCell(OperatorsCell, { wrap: true }),
    },
    { id: 'nodes', width: 170, title: 'Nodes', cell: lineCell(NodesCell) },
    {
      id: 'environment',
      width: 130,
      title: 'Environment',
      visibility: LOW_PRIORITY_COLUMN,
      cell: (row) => <EnvironmentLabel environment={row.cluster.environment} isCompact />,
      sortValue: (row) => row.cluster.environment,
    },
    {
      id: 'type',
      width: 120,
      title: 'Type',
      visibility: LOW_PRIORITY_COLUMN,
      cell: (row) => clusterTypeText(row.cluster.distribution).word,
      sortValue: (row) => row.cluster.distribution,
    },
    {
      id: 'access',
      width: 110,
      title: 'Access',
      visibility: LOW_PRIORITY_COLUMN,
      cell: (row) => (row.cluster.accessMode === 'readOnly' ? <Label isCompact>Read only</Label> : null),
      sortValue: (row) => row.cluster.accessMode,
    },
    {
      id: 'lastChecked',
      title: 'Last checked',
      // The heading says when the fleet was last checked; per-row times are an additional column.
      defaultVisible: false,
      cell: (row) => (row.status ? <Timestamp value={row.status.checkedAt} /> : null),
      sortValue: (row) => (row.status ? Date.parse(row.status.checkedAt) : null),
    },
  ];
}
