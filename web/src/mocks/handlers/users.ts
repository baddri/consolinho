import type { UserRole } from '@/shared/api';
import { actorName, findUser, isAdmin, mockDb, recordAudit } from '../db';
import { adminSourceAuditText, type MockUser } from '../fixtures';
import { conflictProblem, problem } from '../problem';
import { bindBody, bindVersion, type BodyBinder, type EnumValues } from './body';
import { http } from './http';
import { ordinal, sortGrantsByCluster, toGrant, toUserDetail, toUserListItem } from './representations';

const ROLES: EnumValues<UserRole> = ['admin', 'user'];

/** 404 `Users.NotFound`. */
function userNotFound(username: string) {
  return problem(404, { code: 'Users.NotFound', detail: `User ${username} doesn't exist.` });
}

/** USR-2 username rules (subset): required, ≤ 253, no '/', '%', whitespace or control chars, not '.', '..', '~'. */
function bindUsername(body: BodyBinder): string {
  const username = body.requiredString('username', 'Username');
  if (username.length > 253) body.error('username', 'Username must be at most 253 characters.');
  // eslint-disable-next-line no-control-regex -- control characters are exactly what USR-2 forbids
  if (username.trim() !== '' && /[/%\s\u0000-\u001f\u007f]/.test(username)) {
    body.error('username', "Username can't contain '/', '%' or whitespace.");
  }
  if (['.', '..', '~'].includes(username)) body.error('username', `Username can't be '${username}'.`);
  return username;
}

/**
 * ADM-5: `user` is the only writable admin left. Like the domain's `User.IsActiveWritableAdmin`, every admin that is
 * not deactivated and not read-only counts — pre-created (pending) admins included (contract §7.2).
 */
function isLastWritableAdmin(user: MockUser): boolean {
  const writableAdmins = mockDb.users.filter(
    (u) => u.status !== 'deactivated' && isAdmin(u) && !u.isReadOnly,
  );
  return writableAdmins.length === 1 && writableAdmins[0] === user;
}

const lastAdminProblem = (user: MockUser) =>
  problem(409, {
    code: 'Users.LastAdmin',
    detail: `${user.username} is the last active administrator who can make changes. Promote another user first.`,
  });

const selfChangeProblem = () =>
  problem(409, {
    code: 'Users.SelfChange',
    detail: "You can't demote or deactivate yourself. Ask another administrator.",
  });

/** Records an audit entry about `user` and bumps its version (successful, non-idempotent change). */
function commitUserChange(
  user: MockUser,
  action: string,
  summary: string,
  details: Record<string, unknown>,
): void {
  user.version += 1;
  recordAudit({
    action,
    category: 'users',
    targetType: 'user',
    targetId: user.username,
    targetName: user.username,
    clusterName: null,
    summary,
    details,
  });
}

/** Resolves the route's user and checks the request's `version`: the user, or the 404/409 response to send. */
function loadUser(username: string, version: number) {
  const user = findUser(username);
  if (!user) return { error: userNotFound(username) } as const;
  if (version !== user.version) return { error: conflictProblem('user') } as const;
  return { user } as const;
}

/** `/api/admin/users/**` except bulk grants (contract §7.2, ADR-0017). */
export const userHandlers = [
  http.get('/api/admin/users', ({ response }) =>
    response(200).json(
      [...mockDb.users].sort((a, b) => ordinal(a.username, b.username)).map((user) => toUserListItem(user)),
    ),
  ),

  http.post('/api/admin/users', async ({ request, response }) => {
    const bound = await bindBody(request, (body) => ({
      username: bindUsername(body),
      role: body.enumValue('role', 'Role', ROLES, 'user'),
      isReadOnly: body.boolean('isReadOnly', false),
    }));
    if (bound.error) return bound.error;
    const { username, role, isReadOnly } = bound.value;
    if (findUser(username)) {
      return problem(409, { code: 'Users.UsernameTaken', detail: `User ${username} already exists.` });
    }

    const user: MockUser = {
      username,
      displayName: null,
      isAdminByAssignment: role === 'admin',
      adminConfigurationSource: null,
      status: 'pending',
      isReadOnly,
      lastLoginAt: null,
      groups: [],
      createdAt: new Date().toISOString(),
      createdBy: actorName(),
      version: 1,
    };
    mockDb.users.push(user);
    recordAudit({
      action: 'user.created',
      category: 'users',
      targetType: 'user',
      targetId: username,
      targetName: username,
      clusterName: null,
      summary: `${user.createdBy} created user ${username}.`,
      details: { role, isReadOnly },
    });
    return response(201).json(toUserDetail(user), {
      headers: { Location: `/api/admin/users/${encodeURIComponent(username)}` },
    });
  }),

  http.get('/api/admin/users/{username}', ({ params, response }) => {
    const user = findUser(params.username);
    return user ? response(200).json(toUserDetail(user)) : userNotFound(params.username);
  }),

  // Promote/demote, ADR-0017: promote always records the assignment (also for config admins) and is a no-op only
  // when already assigned; demote is a no-op for users, otherwise AdminViaConfiguration → SelfChange → LastAdmin.
  http.put('/api/admin/users/{username}/role', async ({ params, request, response }) => {
    const bound = await bindBody(request, (body) => ({
      role: body.enumValue('role', 'Role', ROLES),
      version: body.version(),
    }));
    if (bound.error) return bound.error;
    const { role } = bound.value;
    const loaded = loadUser(params.username, bound.value.version);
    if (loaded.error) return loaded.error;
    const { user } = loaded;

    const actor = actorName();
    if (role === 'admin') {
      if (!user.isAdminByAssignment) {
        user.isAdminByAssignment = true;
        commitUserChange(user, 'user.promoted', `${actor} promoted ${user.username} to administrator.`, {
          source: 'manual',
          configurationSource: adminSourceAuditText(user.adminConfigurationSource),
        });
      }
      return response(200).json(toUserDetail(user));
    }

    if (!isAdmin(user)) return response(200).json(toUserDetail(user));
    if (user.adminConfigurationSource !== null) {
      return problem(409, {
        code: 'Users.AdminViaConfiguration',
        detail: `Admin granted by configuration (${adminSourceAuditText(user.adminConfigurationSource)}). Change the configuration to remove.`,
      });
    }
    if (user.username === actor) return selfChangeProblem();
    if (isLastWritableAdmin(user)) return lastAdminProblem(user);
    user.isAdminByAssignment = false;
    commitUserChange(user, 'user.demoted', `${actor} demoted ${user.username} to user.`, {
      source: 'manual',
      configurationSource: null,
    });
    return response(200).json(toUserDetail(user));
  }),

  http.put('/api/admin/users/{username}/read-only', async ({ params, request, response }) => {
    const bound = await bindBody(request, (body) => ({
      isReadOnly: body.requiredBoolean('isReadOnly', 'Read-only'),
      version: body.version(),
    }));
    if (bound.error) return bound.error;
    const { isReadOnly } = bound.value;
    const loaded = loadUser(params.username, bound.value.version);
    if (loaded.error) return loaded.error;
    const { user } = loaded;
    if (user.isReadOnly === isReadOnly) return response(200).json(toUserDetail(user));
    if (isReadOnly && isLastWritableAdmin(user)) return lastAdminProblem(user);

    user.isReadOnly = isReadOnly;
    const actor = actorName();
    commitUserChange(
      user,
      'user.read_only_changed',
      `${actor} made ${user.username} ${isReadOnly ? 'read-only' : 'writable'}.`,
      { isReadOnly },
    );
    return response(200).json(toUserDetail(user));
  }),

  http.post('/api/admin/users/{username}/deactivate', async ({ params, request, response }) => {
    const version = await bindVersion(request);
    if (version.error) return version.error;
    const loaded = loadUser(params.username, version.value);
    if (loaded.error) return loaded.error;
    const { user } = loaded;
    if (user.status === 'deactivated') return response(200).json(toUserDetail(user));
    const actor = actorName();
    if (user.username === actor) return selfChangeProblem();
    if (isLastWritableAdmin(user)) return lastAdminProblem(user);

    user.status = 'deactivated';
    commitUserChange(user, 'user.deactivated', `${actor} deactivated ${user.username}.`, {});
    return response(200).json(toUserDetail(user));
  }),

  http.post('/api/admin/users/{username}/reactivate', async ({ params, request, response }) => {
    const version = await bindVersion(request);
    if (version.error) return version.error;
    const loaded = loadUser(params.username, version.value);
    if (loaded.error) return loaded.error;
    const { user } = loaded;
    if (user.status !== 'deactivated') return response(200).json(toUserDetail(user));

    user.status = user.lastLoginAt === null ? 'pending' : 'active';
    const actor = actorName();
    commitUserChange(user, 'user.reactivated', `${actor} reactivated ${user.username}.`, {});
    return response(200).json(toUserDetail(user));
  }),

  http.get('/api/admin/users/{username}/grants', ({ params, response }) => {
    if (!findUser(params.username)) return userNotFound(params.username);
    const grants = sortGrantsByCluster(mockDb.grants.filter((grant) => grant.username === params.username));
    return response(200).json(grants.map((grant) => toGrant(grant)));
  }),
];
