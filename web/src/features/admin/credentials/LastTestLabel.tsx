import { Flex, FlexItem } from '@patternfly/react-core';
import type { CapabilityLevel, ConnectionTestStep, ConnectionTestSummary } from '@/shared/api';
import { RelativeTime, StatusIconText } from '@/shared/ui';

/** Display names of the connection-test steps (TEST-1), as in "Failed at Authentication". */
export const TEST_STEP_LABELS: Record<ConnectionTestStep, string> = {
  reachability: 'Reachability',
  authentication: 'Authentication',
  identity: 'Identity',
  openShiftVersion: 'OpenShift version',
  capabilities: 'Capabilities',
};

/** Display names of the capability headline of a passed test (TEST-3). */
export const CAPABILITY_LABELS: Record<CapabilityLevel, string> = {
  clusterAdmin: 'Cluster admin',
  clusterWideEdit: 'Cluster-wide edit',
  clusterWideView: 'Cluster-wide view',
  limited: 'Limited',
};

/** Props for {@link LastTestLabel}. */
export interface LastTestLabelProps {
  /** The credential's last connection test; `null` = never tested. */
  lastTest: ConnectionTestSummary | null;
  /** Read `Badge` around icon + text — details-page headers only (`UX.md` §3). */
  asLabel?: boolean;
}

/**
 * Last connection test of one credential (CRED-3, TEST-5) as icon + text (`UX.md` §5): "Never tested", "Passed" with
 * the capability headline (green check) or "Failed at <step>" (danger), each with the relative test time; plus a
 * warning "Settings changed since last test" when the cluster's connection settings changed afterwards (`isStale`).
 */
export function LastTestLabel({ lastTest, asLabel }: LastTestLabelProps) {
  if (lastTest === null) return <span className="pf-v6-u-text-color-subtle">Never tested</span>;
  const { succeeded, failedStep, headline, testedAt, isStale } = lastTest;
  let text = 'Failed';
  if (succeeded) text = headline === null ? 'Passed' : `Passed · ${CAPABILITY_LABELS[headline]}`;
  else if (failedStep !== null) text = `Failed at ${TEST_STEP_LABELS[failedStep]}`;
  return (
    <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
      {/* Status and time on their own lines, like the expiry cell; the status never breaks mid-phrase. */}
      <FlexItem className="pf-v6-u-text-nowrap">
        <StatusIconText status={succeeded ? 'success' : 'danger'} text={text} asLabel={asLabel} />
      </FlexItem>
      <FlexItem>
        <RelativeTime value={testedAt} />
      </FlexItem>
      {isStale && (
        <FlexItem>
          <StatusIconText status="warning" text="Settings changed since last test" />
        </FlexItem>
      )}
    </Flex>
  );
}
