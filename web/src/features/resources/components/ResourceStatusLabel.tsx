import { Label } from '@patternfly/react-core';
import type { ResourceStatus } from '../registry/types';

const RED = new Set(['Failed', 'CrashLoopBackOff', 'Error', 'ImagePullBackOff', 'ErrImagePull']);
const ORANGE = new Set(['Pending', 'ContainerCreating']);
const GREEN = new Set(['Running', 'Succeeded']);

/**
 * Colour of a status word (spec §5): red for failures (`Failed`, `CrashLoopBackOff`, `ImagePullBackOff`, …), orange
 * while starting (`Pending`, `ContainerCreating`), green for `Running`/`Succeeded`, grey for anything else
 * (`Terminating`, `Unknown`, `Completed`).
 */
export function statusColor(title: string): ResourceStatus['color'] {
  if (RED.has(title)) return 'red';
  if (ORANGE.has(title)) return 'orange';
  if (GREEN.has(title)) return 'green';
  return 'grey';
}

/** Props for {@link ResourceStatusLabel}. */
export interface ResourceStatusLabelProps {
  status: ResourceStatus | undefined;
}

/** A descriptor's `status` as a compact coloured label; "—" when the object has none. */
export function ResourceStatusLabel({ status }: ResourceStatusLabelProps) {
  if (!status) return <>—</>;
  return (
    <Label isCompact color={status.color}>
      {status.title}
    </Label>
  );
}
