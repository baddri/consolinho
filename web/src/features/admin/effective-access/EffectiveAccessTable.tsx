import { Button, Flex, FlexItem } from '@patternfly/react-core';
import {
  CollapseColumn,
  ExpandableRowContent,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@patternfly/react-table';
import { useState, type ComponentProps } from 'react';
import { Link, useParams } from 'react-router';
import type { EffectiveClusterAccess } from '@/shared/api';
import { fleetAdminPath } from '@/shared/routing';
import { TableEmptyRow, TableSkeletonRows } from '@/shared/table';
import { EnvironmentLabel } from '@/shared/ui';
import { AdminResourceLink } from '../AdminResourceLink';
import { clusterDetailPath } from '../clusters/clusterTarget';
import { AccessModeLabel } from '../grants/AccessModeLabel';
import { userDetailPath } from '../users/userColumns';
import { CandidatesTable } from './CandidatesTable';
import { sourceText } from './effectiveAccessText';

/** PatternFly's toggle-cell class, the one `Td expand` sets (its style module can't be imported in tests). */
const TABLE_TOGGLE_CLASS = 'pf-v6-c-table__toggle';

/** Columns of the clusters table, including the leading expand toggle. */
const COLUMN_COUNT = 5;

/** Router link to the user's Cluster access tab for the empty state's link button (EFF-5); the tab's route names the user. */
function ClusterAccessLink(props: ComponentProps<'a'>) {
  const username = useParams().username ?? '';
  return <Link {...props} to={`${userDetailPath(username)}/access`} />;
}

/** Router link to the Groups list for the empty state's link button (EFF-5). */
function GroupsLink(props: ComponentProps<'a'>) {
  return <Link {...props} to={fleetAdminPath('groups')} />;
}

/** Props for {@link ExpandToggleCell}. */
interface ExpandToggleCellProps {
  clusterName: string;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * The row's expand toggle: what `Td expand` renders (the `pf-v6-c-table__toggle` cell with PF's `CollapseColumn`
 * button), but named "Details for <cluster>". `Td expand` always labels the button by a `simple-node<rowIndex>` id
 * and the fixed text "Details", which can't say which cluster a toggle opens.
 */
function ExpandToggleCell({ clusterName, isExpanded, onToggle }: ExpandToggleCellProps) {
  return (
    <Td className={TABLE_TOGGLE_CLASS}>
      <CollapseColumn
        aria-label={`Details for ${clusterName}`}
        isOpen={isExpanded}
        onToggle={onToggle}
        variant="compact"
      />
    </Td>
  );
}

/** Cluster cell: admin link with the cluster badge, then the compact environment label (as in the grants tables). */
function ClusterCell({ row }: { row: EffectiveClusterAccess }) {
  return (
    <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
      <FlexItem>
        <AdminResourceLink kind="Cluster" name={row.clusterName} to={clusterDetailPath(row.clusterName)} />
      </FlexItem>
      <FlexItem>
        <EnvironmentLabel environment={row.clusterEnvironment} isCompact />
      </FlexItem>
    </Flex>
  );
}

/** Props for {@link EffectiveAccessRow}. */
interface EffectiveAccessRowProps {
  row: EffectiveClusterAccess;
  isExpanded: boolean;
  onToggle: () => void;
}

/**
 * One reachable cluster (EFF-1) in its own `Tbody`: cluster, effective access mode, the one-line source and the
 * winning credential; expanded, every candidate grant with why it won or lost (EFF-2).
 */
function EffectiveAccessRow({ row, isExpanded, onToggle }: EffectiveAccessRowProps) {
  return (
    <Tbody isExpanded={isExpanded}>
      <Tr>
        <ExpandToggleCell clusterName={row.clusterName} isExpanded={isExpanded} onToggle={onToggle} />
        <Td dataLabel="Cluster">
          <ClusterCell row={row} />
        </Td>
        <Td dataLabel="Access mode">
          <AccessModeLabel accessMode={row.accessMode} environment={row.clusterEnvironment} />
        </Td>
        <Td dataLabel="Source">{sourceText(row.source)}</Td>
        <Td dataLabel="Credential">{row.credentialName}</Td>
      </Tr>
      <Tr isExpanded={isExpanded}>
        <Td colSpan={COLUMN_COUNT}>
          {isExpanded && (
            <ExpandableRowContent>
              <CandidatesTable row={row} />
            </ExpandableRowContent>
          )}
        </Td>
      </Tr>
    </Tbody>
  );
}

/** Expanded rows by cluster name; none at first. */
function useExpandedClusters() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (clusterName: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(clusterName)) next.add(clusterName);
      return next;
    });
  return { isExpanded: (clusterName: string) => expanded.has(clusterName), toggle };
}

/** Props for {@link EffectiveAccessTable}. */
export interface EffectiveAccessTableProps {
  username: string;
  /** One row per reachable cluster in API order (by name); `undefined` while loading (skeleton rows). */
  clusters: EffectiveClusterAccess[] | undefined;
}

/**
 * Compact composable table of the clusters a user can open (EFF-1), each row expandable to its candidate grants
 * (EFF-2). No toolbar: at most one row per fleet cluster. Without clusters it shows the EFF-5 empty state with
 * links to the user's Cluster access tab and the Groups list, where access is given.
 */
export function EffectiveAccessTable({ username, clusters }: EffectiveAccessTableProps) {
  const { isExpanded, toggle } = useExpandedClusters();
  return (
    <Table aria-label={`Effective access of ${username}`} variant="compact">
      <Thead>
        <Tr>
          <Th screenReaderText="Row expansion" />
          <Th>Cluster</Th>
          <Th>Access mode</Th>
          <Th>Source</Th>
          <Th>Credential</Th>
        </Tr>
      </Thead>
      {clusters === undefined && (
        <Tbody>
          <TableSkeletonRows columns={COLUMN_COUNT} rows={3} />
        </Tbody>
      )}
      {clusters?.length === 0 && (
        <Tbody>
          <TableEmptyRow
            colSpan={COLUMN_COUNT}
            title={`${username} has no access to any cluster.`}
            actions={
              <>
                <Button variant="link" component={ClusterAccessLink}>
                  Cluster access
                </Button>
                <Button variant="link" component={GroupsLink}>
                  Groups
                </Button>
              </>
            }
          />
        </Tbody>
      )}
      {clusters?.map((row) => (
        <EffectiveAccessRow
          key={row.clusterName}
          row={row}
          isExpanded={isExpanded(row.clusterName)}
          onToggle={() => toggle(row.clusterName)}
        />
      ))}
    </Table>
  );
}
