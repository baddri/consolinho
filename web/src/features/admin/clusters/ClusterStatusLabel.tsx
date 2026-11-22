import { StatusIconText } from '@/shared/ui';

/** Props for {@link ClusterStatusLabel}. */
export interface ClusterStatusLabelProps {
  isEnabled: boolean;
  /** Read `Badge` around icon + text — details-page headers only (`UX.md` §3). */
  asLabel?: boolean;
}

/**
 * Enabled / Disabled state of a cluster (CLU-5) as icon + text (`UX.md` §5): Enabled with a green check, Disabled as
 * plain text. Disabled clusters are hidden from every user's switcher, so this is the visible marker next to the
 * row's subtle text.
 */
export function ClusterStatusLabel({ isEnabled, asLabel }: ClusterStatusLabelProps) {
  return isEnabled ? (
    <StatusIconText status="success" text="Enabled" asLabel={asLabel} />
  ) : (
    <StatusIconText status="neutral" text="Disabled" asLabel={asLabel} />
  );
}
