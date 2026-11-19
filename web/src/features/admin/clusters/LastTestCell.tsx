import { Flex, FlexItem, Icon, Label } from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationCircleIcon } from '@patternfly/react-icons';
import type { ConnectionTestSummary } from '@/shared/api';
import { RelativeTime } from '@/shared/ui';

/** Props for {@link LastTestCell}. */
export interface LastTestCellProps {
  /** The newest test across the cluster's credentials; `null` = never tested. */
  lastTest: ConnectionTestSummary | null;
  /** The credential that test ran with. */
  credentialName: string | null;
}

/**
 * Newest connection test of a cluster (CLU-4, CLU-7): success/failure icon, relative time and the credential used,
 * plus a "Settings changed since last test" warning when the connection settings changed after it (`isStale`).
 * "Never tested" when no credential was ever tested.
 */
export function LastTestCell({ lastTest, credentialName }: LastTestCellProps) {
  if (lastTest === null) return <span className="pf-v6-u-text-color-subtle">Never tested</span>;
  const { succeeded, testedAt, isStale } = lastTest;
  return (
    <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
      <FlexItem>
        <Icon
          isInline
          status={succeeded ? 'success' : 'danger'}
          role="img"
          aria-label={succeeded ? 'Succeeded' : 'Failed'}
        >
          {succeeded ? <CheckCircleIcon /> : <ExclamationCircleIcon />}
        </Icon>{' '}
        <RelativeTime value={testedAt} />
        {credentialName !== null && <span className="pf-v6-u-text-color-subtle"> · {credentialName}</span>}
      </FlexItem>
      {isStale && (
        <FlexItem>
          <Label isCompact status="warning">
            Settings changed since last test
          </Label>
        </FlexItem>
      )}
    </Flex>
  );
}
