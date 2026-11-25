import { Button, Content, Icon, Popover } from '@patternfly/react-core';
import { RhUiArrowCircleUpIcon } from '@patternfly/react-icons';
import { StatusIconText } from '@/shared/ui';
import type { ClusterUpdateView } from './clusterUpdateView';

/**
 * The Update status row of Cluster Settings (OCP `cluster-status.tsx` `UpdateStatus`, read-only): "Up to date",
 * "Available updates", "Update to <version> in progress" with the Progressing message under it, or "Failing" whose
 * Failing message opens in a popover (OCP `StatusMessagePopover`). No Cancel / Update buttons (CP5 Q9).
 */
export function ClusterUpdateStatus({ update }: { update: ClusterUpdateView }) {
  switch (update.kind) {
    case 'failing':
      return update.message ? (
        <Popover bodyContent={update.message} aria-label="Failing">
          <Button variant="link" isInline>
            <StatusIconText status="danger" text="Failing" />
          </Button>
        </Popover>
      ) : (
        <StatusIconText status="danger" text="Failing" />
      );
    case 'updating':
      return (
        <>
          <StatusIconText
            status="progress"
            text={update.version ? `Update to ${update.version} in progress` : 'Update in progress'}
          />
          {update.progress && (
            <Content component="small" className="pf-v6-u-display-block pf-v6-u-text-color-subtle">
              {update.progress}
            </Content>
          )}
        </>
      );
    case 'available':
      return (
        <span>
          <Icon status="info" isInline aria-hidden="true">
            <RhUiArrowCircleUpIcon />
          </Icon>{' '}
          Available updates
        </span>
      );
    default:
      return <StatusIconText status="success" text="Up to date" />;
  }
}
