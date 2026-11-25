import { Flex, FlexItem, Spinner, Tooltip } from '@patternfly/react-core';
import type { FleetClusterStatus } from '@/shared/api';
import { PRODUCT_NAME } from '@/shared/branding';
import type { ClusterHealthStatus } from '@/shared/health';
import { DASH, StatusIconText, type StatusKind } from '@/shared/ui';
import { FLEET_STATUS_TEXT } from '../fleetFilters';
import type { FleetTableRow } from '../fleetTableRows';
import { SecondaryLine } from './SecondaryLine';

/** Icon family per health status (`UX.md` §5 mapping; Restricted = ban icon, T-0343). */
const STATUS_KIND: Readonly<Record<ClusterHealthStatus, StatusKind>> = {
  unreachable: 'danger',
  tokenInvalid: 'danger',
  degraded: 'warning',
  updating: 'progress',
  restricted: 'ban',
  healthy: 'success',
};

/** Why an Unreachable cluster could not be probed, as the cell's second line. */
const FAILURE_TEXT: Partial<Record<NonNullable<FleetClusterStatus['failure']>, string>> = {
  unreachable: 'Connection failed',
  timeout: 'Timed out',
  tlsError: 'TLS error',
  upstreamError: 'Upstream error',
};

/** "Checking…" with a per-row inline spinner (1em, as OCP `LoadingInline`) while the row's line has not arrived (FLT-6). */
function Checking() {
  return (
    <Flex
      display={{ default: 'inlineFlex' }}
      gap={{ default: 'gapSm' }}
      alignItems={{ default: 'alignItemsCenter' }}
      flexWrap={{ default: 'nowrap' }}
    >
      <FlexItem>
        <Spinner isInline aria-hidden="true" />
      </FlexItem>
      <FlexItem>{FLEET_STATUS_TEXT.checking}</FlexItem>
    </Flex>
  );
}

/**
 * Status (FLT-4): the shared health rule's result as icon + text. Restricted carries a tooltip naming the forbidden
 * resources (or the policy block); Unreachable says why underneath. Pending rows show {@link Checking}; a row the
 * failed first fetch never checked shows "—".
 */
export function ClusterStatusCell({ row }: { row: FleetTableRow }) {
  if (row.pending) return <Checking />;
  if (!row.health || !row.status) return <>{DASH}</>;
  const { status, restricted } = row.health;
  const icon = <StatusIconText status={STATUS_KIND[status]} text={FLEET_STATUS_TEXT[status]} />;
  if (status === 'restricted') {
    const reason =
      restricted.length > 0
        ? `Not allowed to read ${restricted.join(', ')}`
        : `Blocked by a ${PRODUCT_NAME} policy`;
    return (
      <Tooltip content={reason}>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <span tabIndex={0}>{icon}</span>
      </Tooltip>
    );
  }
  const failure = row.status.failure ? FAILURE_TEXT[row.status.failure] : undefined;
  return (
    <>
      {icon}
      {status === 'unreachable' && failure && <SecondaryLine text={failure} />}
    </>
  );
}
