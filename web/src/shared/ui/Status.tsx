import { StatusIconText, type StatusKind } from './StatusIconText';
import { DASH } from './dash';

/**
 * Status words → icon family, exactly as OCP `console-dynamic-plugin-sdk/src/app/components/status/Status.tsx`
 * (`UX.md` §5). Words not listed render as text only, like OCP's default branch.
 */
const STATUS_KINDS = new Map<string, StatusKind>(
  (
    [
      [
        ['Pending', 'pending', 'ContainerCreating', 'UpgradePending', 'PendingUpgrade', 'PendingRollback'],
        'pending',
      ],
      [
        [
          'In Progress',
          'Installing',
          'InstallReady',
          'Replacing',
          'Running',
          'Updating',
          'Upgrading',
          'PendingInstall',
        ],
        'progress',
      ],
      [
        [
          'Cancelled',
          'Deleting',
          'Expired',
          'Not Ready',
          'Cancelling',
          'Terminating',
          'Superseded',
          'Uninstalling',
        ],
        'ban',
      ],
      [['Warning', 'RequiresApproval'], 'warning'],
      [
        [
          'ContainerCannotRun',
          'CrashLoopBackOff',
          'CreateContainerConfigError',
          'CreateContainerError',
          'Critical',
          'ErrImagePull',
          'Error',
          'Failed',
          'failed',
          'Failure',
          'ImagePullBackOff',
          'InstallCheckFailed',
          'Lost',
          'Rejected',
          'UpgradeFailed',
        ],
        'danger',
      ],
      [
        [
          'Accepted',
          'Active',
          'Bound',
          'Complete',
          'Completed',
          'Created',
          'Enabled',
          'Succeeded',
          'Ready',
          'Up to date',
          'Loaded',
          'loaded',
          'Provisioned as node',
          'Preferred',
          'Connected',
          'Deployed',
        ],
        'success',
      ],
      [['Info'], 'info'],
      [['Unknown'], 'unknown'],
    ] satisfies [string[], StatusKind][]
  ).flatMap(([words, kind]) => words.map((word) => [word, kind] as const)),
);

/** The icon family OCP shows for a status word; `neutral` (text only) for anything it doesn't know. */
export function statusKindOf(status: string): StatusKind {
  return STATUS_KINDS.get(status) ?? 'neutral';
}

/** Props for {@link Status}. */
export interface StatusProps {
  /** The status word, e.g. `Running`, `CrashLoopBackOff`, `Active`. */
  status: string;
  /** Text to show instead of the status word. */
  title?: string;
  /** In a read `Badge`, for a details-page title (`UX.md` §3). */
  asLabel?: boolean;
}

/**
 * OCP `Status`: a Kubernetes status word as icon + text via {@link statusKindOf} — one component for list cells,
 * details headings and admin pages. "-" for an empty status.
 */
export function Status({ status, title, asLabel }: StatusProps) {
  if (!status) return <>{DASH}</>;
  return <StatusIconText status={statusKindOf(status)} text={title ?? status} asLabel={asLabel} />;
}
