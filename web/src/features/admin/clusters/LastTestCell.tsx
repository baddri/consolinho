import { Flex, FlexItem } from '@patternfly/react-core';
import type { ConnectionTestSummary } from '@/shared/api';
import { RelativeTime, StatusIconText } from '@/shared/ui';

/** Props for {@link LastTestCell}. */
export interface LastTestCellProps {
  /** The newest test across the cluster's credentials; `null` = never tested. */
  lastTest: ConnectionTestSummary | null;
  /** The credential that test ran with. */
  credentialName: string | null;
  /** Read `Badge` around icon + text — details-page headers only (`UX.md` §3). */
  asLabel?: boolean;
}

/**
 * Newest connection test of a cluster (CLU-4, CLU-7) as icon + text (`UX.md` §5): "Passed" / "Failed" with the
 * relative time, the credential used below it, plus a "Settings changed since last test" warning when the connection
 * settings changed after it (`isStale`). "Never tested" when no credential was ever tested.
 */
export function LastTestCell({ lastTest, credentialName, asLabel }: LastTestCellProps) {
  if (lastTest === null) return <span className="pf-v6-u-text-color-subtle">Never tested</span>;
  const { succeeded, testedAt, isStale } = lastTest;
  return (
    // Status + time stay on one line; the credential and the stale warning go below.
    <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
      <FlexItem className="pf-v6-u-text-nowrap">
        <StatusIconText
          status={succeeded ? 'success' : 'danger'}
          text={succeeded ? 'Passed' : 'Failed'}
          asLabel={asLabel}
        />{' '}
        <RelativeTime value={testedAt} />
      </FlexItem>
      {credentialName !== null && <FlexItem className="pf-v6-u-text-color-subtle">{credentialName}</FlexItem>}
      {isStale && (
        <FlexItem>
          <StatusIconText status="warning" text="Settings changed since last test" />
        </FlexItem>
      )}
    </Flex>
  );
}
