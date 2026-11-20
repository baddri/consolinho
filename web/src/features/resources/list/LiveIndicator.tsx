import { Label } from '@patternfly/react-core';
import type { LiveStatus } from '@/shared/k8s';

/**
 * Small "Live" / "Paused — retrying" label next to a list title (DATA-3, spec §5 "Live indicator"); nothing while
 * the first watch connects, so a healthy page doesn't flicker a warning.
 */
export function LiveIndicator({ status }: { status: LiveStatus }) {
  if (status === 'live') {
    return (
      <Label isCompact color="green">
        Live
      </Label>
    );
  }
  if (status === 'paused') {
    return (
      <Label isCompact color="orange" status="warning">
        Paused — retrying
      </Label>
    );
  }
  return null;
}
