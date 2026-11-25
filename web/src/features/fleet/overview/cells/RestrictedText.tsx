import { Tooltip } from '@patternfly/react-core';
import type { RestrictedProbe } from '@/shared/health';

/**
 * A cell whose section the cluster's ServiceAccount may not read (FLT-4): "Restricted", with a tooltip naming the
 * resource. The span is focusable so keyboard users reach the tooltip, as other table-cell tooltips here.
 */
export function RestrictedText({ probe }: { probe: RestrictedProbe }) {
  return (
    <Tooltip content={`Not allowed to read ${probe}`}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span tabIndex={0}>Restricted</span>
    </Tooltip>
  );
}
