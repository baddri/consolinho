import { clusterUpdate, clusterVersionFacts } from '@/shared/health';
import type { ClusterVersion } from '@/shared/k8s';

/** What the Update status row shows, with the condition message behind it. */
export type ClusterUpdateView =
  | { kind: 'failing'; message?: string }
  | { kind: 'updating'; version: string | null; progress?: string }
  | { kind: 'available' }
  | { kind: 'upToDate' };

/** The message of `cv`'s condition `type` when it is `True`. */
function trueConditionMessage(cv: ClusterVersion, type: string): string | undefined {
  return cv.status?.conditions?.find((c) => c.type === type && c.status === 'True')?.message;
}

/**
 * The Update status of a ClusterVersion (OCP `cluster-status.tsx` `UpdateStatus`) from the shared
 * `shared/health:clusterUpdate` rule: Failing (with the Failing message), Updating to the desired version (with the
 * Progressing message as progress text), Available updates, else Up to date.
 */
export function clusterUpdateView(cv: ClusterVersion): ClusterUpdateView {
  const update = clusterUpdate(clusterVersionFacts(cv));
  switch (update?.kind) {
    case 'failing': {
      const message = trueConditionMessage(cv, 'Failing');
      return message === undefined ? { kind: 'failing' } : { kind: 'failing', message };
    }
    case 'updating': {
      const progress = trueConditionMessage(cv, 'Progressing');
      return progress === undefined
        ? { kind: 'updating', version: update.version }
        : { kind: 'updating', version: update.version, progress };
    }
    case 'available':
      return { kind: 'available' };
    default:
      return { kind: 'upToDate' };
  }
}

/** `status.availableUpdates` versions, newest first (numeric compare, so 4.18.15 sorts above 4.18.9). */
export function availableVersions(cv: ClusterVersion): string[] {
  const versions = (cv.status?.availableUpdates ?? []).flatMap((release) =>
    release.version ? [release.version] : [],
  );
  return versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
}
