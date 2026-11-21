import { StatusIconText, type StatusKind } from '@/shared/ui';
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

/**
 * The `StatusIconText` kind of a descriptor status colour: red → danger, orange → pending, green → success, anything
 * else (grey, …) → neutral. Descriptors keep speaking in colours; only this adapter knows the icon vocabulary.
 */
export function toStatusKind(color: ResourceStatus['color']): StatusKind {
  switch (color) {
    case 'red':
      return 'danger';
    case 'orange':
      return 'pending';
    case 'green':
      return 'success';
    default:
      return 'neutral';
  }
}

/** Props for {@link ResourceStatusLabel}. */
export interface ResourceStatusLabelProps {
  status: ResourceStatus | undefined;
  /** Outlined compact label with the icon, for a details-page title (`UX.md` §3); icon + text otherwise. */
  asLabel?: boolean;
}

/**
 * A descriptor's `status` as OCP status icon + text (`UX.md` §5) — the one adapter from `ResourceStatus` to
 * `StatusIconText`, used by list cells and the details heading; "—" when the object has none.
 */
export function ResourceStatusLabel({ status, asLabel }: ResourceStatusLabelProps) {
  if (!status) return <>—</>;
  return <StatusIconText status={toStatusKind(status.color)} text={status.title} asLabel={asLabel} />;
}
