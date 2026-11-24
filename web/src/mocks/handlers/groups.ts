import type { GroupDetail, GroupList, GroupRow } from '@/shared/api';
import { findHostGroup, findUser, mockDb } from '../db';
import { problem } from '../problem';
import { isSystemGroup } from './access';
import { http } from './http';
import { isGroupGrantOf, ordinal } from './representations';

const MAX_GROUP_NAME = 253;
// eslint-disable-next-line no-control-regex -- GRP-6 forbids control characters, which is exactly what this matches.
const FORBIDDEN_GROUP_CHARS = /[/%:\u0000-\u001f\u007f]/;

/**
 * The 400 message for an ungrantable group name, or `undefined` when it is valid: `system:*` (any case) first
 * (GRP-3), then the GRP-6 shape rules (trimmed, 1–253 chars, not `.`/`..`, no `/`, `%`, `:` or control characters).
 */
export function groupNameError(name: string): string | undefined {
  if (isSystemGroup(name)) return "System groups can't be granted access.";
  const invalid =
    name === '' ||
    name !== name.trim() ||
    name.length > MAX_GROUP_NAME ||
    name === '.' ||
    name === '..' ||
    FORBIDDEN_GROUP_CHARS.test(name);
  return invalid ? 'Enter a valid group name.' : undefined;
}

/** 404 `Groups.NotFound`. */
function groupNotFound(name: string) {
  return problem(404, { code: 'Groups.NotFound', detail: `Group ${name} doesn't exist.` });
}

/** Number of group grants of `name`. */
function clusterCountOf(name: string): number {
  return mockDb.grants.filter((grant) => isGroupGrantOf(grant, name)).length;
}

/** `hostReadAt`: when the host groups were read; `null` while the listing fails (never read successfully). */
function hostReadAt(): string | null {
  return mockDb.hostGroups.status === 'ok' ? mockDb.hostGroups.readAt : null;
}

/** One Groups list row; host facts are `null` when the listing failed (contract §4). */
function toGroupRow(name: string): GroupRow {
  const hostOk = mockDb.hostGroups.status === 'ok';
  const onHost = findHostGroup(name);
  return {
    name,
    foundOnHost: hostOk ? onHost !== undefined : null,
    memberCount: onHost ? onHost.users.length : null,
    clusterCount: clusterCountOf(name),
  };
}

/** `/api/admin/groups/**` reads (contract CP4.5a §4, GPG-1/2, UIG-2). Group grants live in `grants.ts`. */
export const groupHandlers = [
  // Host groups ∪ groups named in grants, `system:*` excluded, sorted by name; a failed listing still answers 200.
  http.get('/api/admin/groups', ({ response }) => {
    const { status } = mockDb.hostGroups;
    const names = new Set([
      ...(status === 'ok' ? mockDb.hostGroups.groups.map((group) => group.name) : []),
      ...mockDb.grants.filter((grant) => grant.subjectKind === 'group').map((grant) => grant.subjectName),
    ]);
    const items = [...names]
      .filter((name) => !isSystemGroup(name))
      .sort(ordinal)
      .map((name) => toGroupRow(name));
    const list: GroupList = { hostStatus: status, hostReadAt: hostReadAt(), items };
    return response(200).json(list);
  }),

  // 404 for an invalid name, or (host listing ok) a group neither on the host nor in any grant.
  http.get('/api/admin/groups/{groupName}', ({ params, response }) => {
    const name = params.groupName;
    if (groupNameError(name) !== undefined) return groupNotFound(name);
    const { status } = mockDb.hostGroups;
    const onHost = findHostGroup(name);
    const clusterCount = clusterCountOf(name);
    if (status === 'ok' && !onHost && clusterCount === 0) return groupNotFound(name);

    const members = onHost
      ? [...onHost.users].sort(ordinal).map((username) => {
          const user = findUser(username);
          return {
            username,
            isRegistered: user !== undefined,
            displayName: user?.displayName ?? null,
            status: user?.status ?? null,
          };
        })
      : null;
    const detail: GroupDetail = {
      name,
      hostStatus: status,
      hostReadAt: hostReadAt(),
      foundOnHost: status === 'ok' ? onHost !== undefined : null,
      clusterCount,
      members,
    };
    return response(200).json(detail);
  }),
];
