import type { LiveStatus } from '@/shared/k8s';
import { StatusIconText } from '@/shared/ui';

/**
 * Watch state next to a list title, in the `PageHeading` status slot: nothing while live or while the first watch
 * connects (OCP shows no live badge, `UX.md` §3), and "Paused — retrying" with a warning icon while the watch is down
 * (DATA-3).
 */
export function LiveIndicator({ status }: { status: LiveStatus }) {
  if (status === 'paused') return <StatusIconText status="warning" text="Paused — retrying" />;
  return null;
}
