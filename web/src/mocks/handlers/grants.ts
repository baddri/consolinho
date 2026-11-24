import type { AccessMode } from '@/shared/api';
import {
  actorName,
  findCluster,
  findCredential,
  findGrant,
  findUser,
  mockDb,
  newMockId,
  recordAudit,
} from '../db';
import type { MockGrant } from '../fixtures';
import { conflictProblem, problem } from '../problem';
import { bindBody, type BodyBinder, type EnumValues } from './body';
import { http } from './http';
import { groupNameError } from './groups';
import { isGroupGrantOf, isUserGrantOf, ordinal, toGrant } from './representations';

const ACCESS_MODES: EnumValues<AccessMode> = ['readOnly', 'readWrite'];
const MAX_BULK_ITEMS = 100;
const MIN_PRIORITY = 1;
const MAX_PRIORITY = 1000;
const PRIORITY_RANGE = `Priority must be between ${MIN_PRIORITY} and ${MAX_PRIORITY}.`;

/** 404 `Grants.NotFound`. */
function grantNotFound() {
  return problem(404, { code: 'Grants.NotFound', detail: "Grant doesn't exist." });
}

/** Records a field error on `key` when the credential is unknown or belongs to another cluster (§9.3). */
function checkCredential(body: BodyBinder, key: string, credentialId: string, clusterName: string): void {
  const credential = findCredential(credentialId);
  if (!credential) body.error(key, "Credential doesn't exist.");
  else if (credential.clusterName !== clusterName) {
    body.error(key, 'This credential belongs to another cluster.');
  }
}

/** The subject as the audit and summaries name it: `alice` or `group sre` (GRP-7). */
function subjectText(grant: Pick<MockGrant, 'subjectKind' | 'subjectName'>): string {
  return grant.subjectKind === 'user' ? grant.subjectName : `group ${grant.subjectName}`;
}

/** Audits a change of `grant` ("alice → prod-eu-1", "group sre → dev-1"). */
function auditGrant(
  grant: MockGrant,
  action: string,
  summary: string,
  details: Record<string, unknown>,
): void {
  recordAudit({
    action,
    category: 'grants',
    targetType: 'grant',
    targetId: grant.id,
    targetName: `${subjectText(grant)} → ${grant.clusterName}`,
    clusterName: grant.clusterName,
    summary,
    details,
  });
}

/** Audit details of a grant: user grants as before, group grants with kind, name and priority (GRP-7). */
function grantDetails(grant: MockGrant): Record<string, unknown> {
  const credential = findCredential(grant.credentialId)?.name ?? null;
  return grant.subjectKind === 'user'
    ? { username: grant.subjectName, accessMode: grant.accessMode, credential }
    : {
        subjectKind: 'group',
        groupName: grant.subjectName,
        priority: grant.priority,
        accessMode: grant.accessMode,
        credential,
      };
}

/** What a new grant is for: a user (no priority) or a group with its priority. */
type GrantSubject = Pick<MockGrant, 'subjectKind' | 'subjectName' | 'priority'>;

/** Creates, stores and audits a grant. */
function createGrant(
  subject: GrantSubject,
  clusterName: string,
  credentialId: string,
  accessMode: AccessMode,
): MockGrant {
  const grant: MockGrant = {
    id: newMockId(),
    ...subject,
    clusterName,
    credentialId,
    accessMode,
    grantedAt: new Date().toISOString(),
    grantedBy: actorName(),
    updatedAt: null,
    updatedBy: null,
    version: 1,
  };
  mockDb.grants.push(grant);
  auditGrant(
    grant,
    'grant.created',
    `${actorName()} granted ${subjectText(grant)} ${accessMode} access to ${clusterName}.`,
    grantDetails(grant),
  );
  return grant;
}

/** A user subject. */
const userSubject = (username: string): GrantSubject => ({ subjectKind: 'user', subjectName: username, priority: null });

/** The group grant on `clusterName` holding `priority`, other than `except` (GRP-4: unique per cluster). */
function priorityHolder(clusterName: string, priority: number, except?: MockGrant): MockGrant | undefined {
  return mockDb.grants.find(
    (g) => g !== except && g.subjectKind === 'group' && g.clusterName === clusterName && g.priority === priority,
  );
}

/** GRP-4 copy, shown on the Priority field by the UI. */
const priorityTakenText = (priority: number, holder: MockGrant) =>
  `Priority ${priority} is already used by group \`${holder.subjectName}\` on this cluster.`;

/** GRP-5 copy. */
const groupAlreadyGrantedText = (groupName: string, clusterName: string) =>
  `Group "${groupName}" already has access to "${clusterName}".`;

/** Binds `priority` (GRP-2): required, 1–1000; records the range error and returns `null` when it isn't. */
function bindPriority(body: BodyBinder): number | null {
  const priority = body.optionalInt('priority');
  if (priority === null || priority < MIN_PRIORITY || priority > MAX_PRIORITY) {
    body.error('priority', PRIORITY_RANGE);
    return null;
  }
  return priority;
}

/** Records the GRP-3/GRP-6 error of the route's group name on `groupName`. */
function checkGroupName(body: BodyBinder, groupName: string): void {
  const error = groupNameError(groupName);
  if (error !== undefined) body.error('groupName', error);
}

/** One bound bulk item. */
interface BulkItem {
  clusterName: string;
  credentialId: string;
}

/**
 * Binds and validates the bulk items (GRANT-4, GPG-3): each item's problems are recorded under `items[i].…` so the
 * review table can mark rows. A non-object item or a non-array `items` is a binding failure (framework 400).
 * `subject.priority` (groups) adds the GRP-4 "priority taken" check per cluster.
 */
function bindBulkItems(body: BodyBinder, subject: GrantSubject): BulkItem[] {
  const items = body.objectArray('items');
  if (items.length === 0 || items.length > MAX_BULK_ITEMS) {
    body.error('items', `Select between 1 and ${MAX_BULK_ITEMS} clusters.`);
  }
  const seen = new Set<string>();
  return items.map((item) => {
    const clusterName = item.requiredString('clusterName', 'Cluster');
    const credentialId = item.requiredString('credentialId', 'Credential');
    if (clusterName.trim() === '') return { clusterName, credentialId };
    if (seen.has(clusterName)) item.error('clusterName', 'Cluster listed twice.');
    seen.add(clusterName);
    if (!findCluster(clusterName)) {
      item.error('clusterName', `Cluster ${clusterName} doesn't exist.`);
      return { clusterName, credentialId };
    }
    checkBulkSubject(item, subject, clusterName);
    if (credentialId.trim() !== '') checkCredential(item, 'credentialId', credentialId, clusterName);
    return { clusterName, credentialId };
  });
}

/** Per-item subject checks: already granted (GRANT-1/GRP-5) and, for groups, priority taken (GRP-4). */
function checkBulkSubject(item: BodyBinder, subject: GrantSubject, clusterName: string): void {
  const { subjectKind, subjectName, priority } = subject;
  if (subjectKind === 'user') {
    if (mockDb.grants.some((g) => isUserGrantOf(g, subjectName) && g.clusterName === clusterName)) {
      item.error('clusterName', `${subjectName} already has access to ${clusterName}.`);
    }
    return;
  }
  if (mockDb.grants.some((g) => isGroupGrantOf(g, subjectName) && g.clusterName === clusterName)) {
    item.error('clusterName', groupAlreadyGrantedText(subjectName, clusterName));
  }
  const holder = priority === null ? undefined : priorityHolder(clusterName, priority);
  if (holder && priority !== null) item.error('clusterName', priorityTakenText(priority, holder));
}

/**
 * Binds the PUT body's `priority` against the grant's kind: required 1–1000 for group grants (GRP-2), absent/null for
 * user grants. Returns the grant's new priority.
 */
function bindUpdatePriority(body: BodyBinder, existing: MockGrant | undefined): number | null {
  if (existing?.subjectKind === 'group') return bindPriority(body);
  const priority = body.optionalInt('priority');
  if (existing && priority !== null) body.error('priority', 'Priority applies to group grants only.');
  return null;
}

/** Grant commands (contract §9.2–§9.4). The per-user and per-cluster grant lists live with users / clusters. */
export const grantHandlers = [
  http.post('/api/admin/grants', async ({ request, response }) => {
    const bound = await bindBody(request, (body) => {
      const username = body.requiredString('username', 'User');
      const clusterName = body.requiredString('clusterName', 'Cluster');
      const credentialId = body.requiredString('credentialId', 'Credential');
      const accessMode = body.enumValue('accessMode', 'Access mode', ACCESS_MODES, 'readOnly');
      if (username.trim() !== '' && !findUser(username)) {
        body.error('username', `User ${username} doesn't exist.`);
      }
      if (clusterName.trim() !== '' && !findCluster(clusterName)) {
        body.error('clusterName', `Cluster ${clusterName} doesn't exist.`);
      } else if (credentialId.trim() !== '') {
        checkCredential(body, 'credentialId', credentialId, clusterName);
      }
      return { username, clusterName, credentialId, accessMode };
    });
    if (bound.error) return bound.error;
    const { username, clusterName, credentialId, accessMode } = bound.value;
    if (mockDb.grants.some((g) => isUserGrantOf(g, username) && g.clusterName === clusterName)) {
      return problem(409, {
        code: 'Grants.AlreadyExists',
        detail: `${username} already has access to ${clusterName} — change the existing grant instead`,
      });
    }

    const grant = createGrant(userSubject(username), clusterName, credentialId, accessMode);
    return response(201).json(toGrant(grant), { headers: { Location: `/api/admin/grants/${grant.id}` } });
  }),

  http.put('/api/admin/grants/{grantId}', async ({ params, request, response }) => {
    // The credential must belong to the grant's cluster: a body rule that needs the grant, checked like the Api's
    // validator (which loads it) — before the 404 for an unknown grant would otherwise be reported.
    const existing = findGrant(params.grantId);
    const bound = await bindBody(request, (body) => {
      const accessMode = body.enumValue('accessMode', 'Access mode', ACCESS_MODES);
      const credentialId = body.requiredString('credentialId', 'Credential');
      const version = body.version();
      const priority = bindUpdatePriority(body, existing);
      if (existing && credentialId.trim() !== '') {
        checkCredential(body, 'credentialId', credentialId, existing.clusterName);
      }
      return { accessMode, credentialId, version, priority };
    });
    if (bound.error) return bound.error;
    const { accessMode, credentialId, version, priority } = bound.value;
    if (!existing) return grantNotFound();
    const grant = existing;
    if (version !== grant.version) return conflictProblem('grant');
    if (grant.accessMode === accessMode && grant.credentialId === credentialId && grant.priority === priority) {
      return response(200).json(toGrant(grant));
    }
    const holder = priority === null ? undefined : priorityHolder(grant.clusterName, priority, grant);
    if (holder && priority !== null) {
      return problem(409, { code: 'Grants.PriorityTaken', detail: priorityTakenText(priority, holder) });
    }

    const details = {
      ...(grant.subjectKind === 'group'
        ? { subjectKind: 'group', groupName: grant.subjectName, oldPriority: grant.priority, newPriority: priority }
        : {}),
      oldAccessMode: grant.accessMode,
      newAccessMode: accessMode,
      oldCredential: findCredential(grant.credentialId)?.name ?? null,
      newCredential: findCredential(credentialId)?.name ?? null,
    };
    Object.assign(grant, {
      accessMode,
      credentialId,
      priority,
      updatedAt: new Date().toISOString(),
      updatedBy: actorName(),
      version: grant.version + 1,
    });
    auditGrant(
      grant,
      'grant.changed',
      `${actorName()} changed ${subjectText(grant)}'s access to ${grant.clusterName}.`,
      details,
    );
    return response(200).json(toGrant(grant));
  }),

  http.delete('/api/admin/grants/{grantId}', ({ params, response }) => {
    const grant = findGrant(params.grantId);
    if (!grant) return grantNotFound();
    mockDb.grants = mockDb.grants.filter((g) => g !== grant);
    auditGrant(
      grant,
      'grant.revoked',
      `${actorName()} revoked ${subjectText(grant)}'s access to ${grant.clusterName}.`,
      grantDetails(grant),
    );
    return response(204).empty();
  }),

  // GRANT-4: all-or-nothing; per-item problems are 400 field errors keyed `items[i].clusterName|credentialId`.
  // Body validation first, then the route's 404 (the Api's validator runs before the handler).
  http.post('/api/admin/users/{username}/grants/bulk', async ({ params, request, response }) => {
    const bound = await bindBody(request, (body) => ({
      accessMode: body.enumValue('accessMode', 'Access mode', ACCESS_MODES),
      items: bindBulkItems(body, userSubject(params.username)),
    }));
    if (bound.error) return bound.error;
    if (!findUser(params.username)) {
      return problem(404, { code: 'Users.NotFound', detail: `User ${params.username} doesn't exist.` });
    }

    const { accessMode, items } = bound.value;
    const created = items.map((item) =>
      createGrant(userSubject(params.username), item.clusterName, item.credentialId, accessMode),
    );
    return response(200).json(created.map((grant) => toGrant(grant)));
  }),

  // ---- Group grants (contract CP4.5a §3)

  // Unknown or invalid names list nothing (no 404).
  http.get('/api/admin/groups/{groupName}/grants', ({ params, response }) => {
    const grants = mockDb.grants
      .filter((grant) => isGroupGrantOf(grant, params.groupName))
      .sort((a, b) => ordinal(a.clusterName, b.clusterName));
    return response(200).json(grants.map((grant) => toGrant(grant)));
  }),

  // Validation (name GRP-3/6, priority GRP-2, cluster/credential like POST /grants) → 409 duplicate (GRP-5) → 409
  // priority taken (GRP-4).
  http.post('/api/admin/groups/{groupName}/grants', async ({ params, request, response }) => {
    const groupName = params.groupName;
    const bound = await bindBody(request, (body) => {
      checkGroupName(body, groupName);
      const clusterName = body.requiredString('clusterName', 'Cluster');
      const credentialId = body.requiredString('credentialId', 'Credential');
      const accessMode = body.enumValue('accessMode', 'Access mode', ACCESS_MODES, 'readOnly');
      const priority = bindPriority(body);
      if (clusterName.trim() !== '' && !findCluster(clusterName)) {
        body.error('clusterName', `Cluster ${clusterName} doesn't exist.`);
      } else if (credentialId.trim() !== '') {
        checkCredential(body, 'credentialId', credentialId, clusterName);
      }
      return { clusterName, credentialId, accessMode, priority: priority ?? MIN_PRIORITY };
    });
    if (bound.error) return bound.error;
    const { clusterName, credentialId, accessMode, priority } = bound.value;
    if (mockDb.grants.some((g) => isGroupGrantOf(g, groupName) && g.clusterName === clusterName)) {
      return problem(409, { code: 'Grants.AlreadyExists', detail: groupAlreadyGrantedText(groupName, clusterName) });
    }
    const holder = priorityHolder(clusterName, priority);
    if (holder) return problem(409, { code: 'Grants.PriorityTaken', detail: priorityTakenText(priority, holder) });

    const subject: GrantSubject = { subjectKind: 'group', subjectName: groupName, priority };
    const grant = createGrant(subject, clusterName, credentialId, accessMode);
    return response(201).json(toGrant(grant), { headers: { Location: `/api/admin/grants/${grant.id}` } });
  }),

  // GPG-3: all-or-nothing like the user bulk; every failing item is listed (`items[i].clusterName|credentialId`).
  http.post('/api/admin/groups/{groupName}/grants/bulk', async ({ params, request, response }) => {
    const groupName = params.groupName;
    const bound = await bindBody(request, (body) => {
      checkGroupName(body, groupName);
      const accessMode = body.enumValue('accessMode', 'Access mode', ACCESS_MODES);
      const priority = bindPriority(body);
      const subject: GrantSubject = { subjectKind: 'group', subjectName: groupName, priority };
      return { accessMode, priority: priority ?? MIN_PRIORITY, items: bindBulkItems(body, subject) };
    });
    if (bound.error) return bound.error;

    const { accessMode, priority, items } = bound.value;
    const subject: GrantSubject = { subjectKind: 'group', subjectName: groupName, priority };
    const created = items.map((item) => createGrant(subject, item.clusterName, item.credentialId, accessMode));
    return response(200).json(created.map((grant) => toGrant(grant)));
  }),
];
