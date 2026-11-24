import { Label, Tooltip } from '@patternfly/react-core';
import { PRODUCT_NAME } from '@/shared/branding';
import { DASH } from '@/shared/ui';

/** Why host facts (members, member count) can be unknown: FleetConsole couldn't read the host's groups (Q7). */
export const HOST_GROUPS_HINT = `${PRODUCT_NAME}'s host service account needs permission to list groups (groups.user.openshift.io).`;

/** Why a group has no host members: it isn't on the host (`foundOnHost === false`), or the host read failed. */
export function unknownMembersReason(foundOnHost: boolean | null): string {
  return foundOnHost === false
    ? "The group doesn't exist on the host cluster."
    : `Member count unavailable: ${PRODUCT_NAME} can't read groups on the host cluster.`;
}

/**
 * Compact "Not found on host cluster" label of a group that only exists in grants (`foundOnHost === false`, GPG-1).
 * Renders nothing when the group is on the host or the host listing failed (`null`: we don't know).
 */
export function GroupNotOnHostLabel({ foundOnHost }: { foundOnHost: boolean | null }) {
  if (foundOnHost !== false) return null;
  return <Label isCompact>Not found on host cluster</Label>;
}

/** Props for {@link GroupMemberCount}. */
export interface GroupMemberCountProps {
  count: number | null;
  /** Picks the tooltip: `false` = grant-only group, otherwise the host read failed. */
  foundOnHost: boolean | null;
}

/**
 * A group's member count, or `-` with a keyboard-reachable tooltip explaining why it is unknown (`null`, Q7):
 * the group isn't on the host cluster, or FleetConsole couldn't read the host's groups.
 */
export function GroupMemberCount({ count, foundOnHost }: GroupMemberCountProps) {
  if (count !== null) return <>{count}</>;
  return (
    <Tooltip content={unknownMembersReason(foundOnHost)}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the tooltip must be reachable by keyboard. */}
      <span tabIndex={0}>{DASH}</span>
    </Tooltip>
  );
}
