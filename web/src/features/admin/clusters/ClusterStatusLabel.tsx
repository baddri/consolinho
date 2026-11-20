import { Label } from '@patternfly/react-core';

/**
 * Enabled / Disabled state of a cluster (CLU-5). Disabled clusters are hidden from every user's switcher, so the
 * label is the visible marker next to the row's subtle text.
 */
export function ClusterStatusLabel({ isEnabled }: { isEnabled: boolean }) {
  return isEnabled ? (
    <Label isCompact color="green">
      Enabled
    </Label>
  ) : (
    <Label isCompact color="grey">
      Disabled
    </Label>
  );
}
