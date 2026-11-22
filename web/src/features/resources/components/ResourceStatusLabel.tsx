import { Status } from '@/shared/ui';
import type { ResourceStatus } from '../registry/types';

/** Props for {@link ResourceStatusLabel}. */
export interface ResourceStatusLabelProps {
  status: ResourceStatus | undefined;
  /** Outlined compact label with the icon, for a details-page title (`UX.md` §3); icon + text otherwise. */
  asLabel?: boolean;
}

/**
 * A descriptor's `status` as OCP status icon + text (shared `Status`, `UX.md` §5), used by list cells and the details
 * heading; "—" when the object has none.
 */
export function ResourceStatusLabel({ status, asLabel }: ResourceStatusLabelProps) {
  if (!status) return <>—</>;
  return <Status status={status.title} asLabel={asLabel} />;
}
