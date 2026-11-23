import { Button, Popover } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { Status } from '@/shared/ui';

/** Props for {@link PodStatusPopover}. */
export interface PodStatusPopoverProps {
  /** The pod status word shown on the trigger (icon + text). */
  status: string;
  headerContent?: ReactNode;
  bodyContent: ReactNode;
  footerContent?: ReactNode;
}

/**
 * OCP `PodStatusPopover` (`pod-list.tsx`): the pod status as an inline link button that opens a PF `Popover`
 * explaining a problem state.
 */
export function PodStatusPopover({ status, headerContent, bodyContent, footerContent }: PodStatusPopoverProps) {
  return (
    <Popover headerContent={headerContent} bodyContent={bodyContent} footerContent={footerContent}>
      <Button variant="link" isInline data-test="popover-status-button">
        <Status status={status} />
      </Button>
    </Popover>
  );
}
