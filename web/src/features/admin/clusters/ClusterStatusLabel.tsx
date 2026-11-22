import { StatusIconText } from '@/shared/ui';

/** Props for {@link ClusterStatusLabel}. */
export interface ClusterStatusLabelProps {
  isEnabled: boolean;
  /** Read `Badge` around icon + text — details-page headers only (`UX.md` §3). */
  asLabel?: boolean;
}

/**
 * Enabled / Disabled state of a cluster (CLU-5) as icon + text (`UX.md` §5): Enabled with a green check, Disabled with
 * OCP's ban icon. Disabled clusters are hidden from every user's switcher; like OCP, rows are not greyed out, so this
 * status is the marker.
 */
export function ClusterStatusLabel({ isEnabled, asLabel }: ClusterStatusLabelProps) {
  return isEnabled ? (
    <StatusIconText status="success" text="Enabled" asLabel={asLabel} />
  ) : (
    <StatusIconText status="ban" text="Disabled" asLabel={asLabel} />
  );
}
