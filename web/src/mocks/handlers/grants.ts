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
import { toGrant } from './representations';

const ACCESS_MODES: EnumValues<AccessMode> = ['readOnly', 'readWrite'];
const MAX_BULK_ITEMS = 100;

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

/** Audits a change of `grant` ("alice → prod-eu-1"). */
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
    targetName: `${grant.username} → ${grant.clusterName}`,
    clusterName: grant.clusterName,
    summary,
    details,
  });
}

/** Creates, stores and audits a grant. */
function createGrant(
  username: string,
  clusterName: string,
  credentialId: string,
  accessMode: AccessMode,
): MockGrant {
  const grant: MockGrant = {
    id: newMockId(),
    username,
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
    `${actorName()} granted ${username} ${accessMode} access to ${clusterName}.`,
    { username, accessMode, credential: findCredential(credentialId)?.name ?? null },
  );
  return grant;
}

/** One bound bulk item. */
interface BulkItem {
  clusterName: string;
  credentialId: string;
}

/**
 * Binds and validates the bulk items (GRANT-4): each item's problems are recorded under `items[i].…` so the review
 * table can mark rows. A non-object item or a non-array `items` is a binding failure (framework 400).
 */
function bindBulkItems(body: BodyBinder, username: string): BulkItem[] {
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
    if (mockDb.grants.some((g) => g.username === username && g.clusterName === clusterName)) {
      item.error('clusterName', `${username} already has access to ${clusterName}.`);
    }
    if (credentialId.trim() !== '') checkCredential(item, 'credentialId', credentialId, clusterName);
    return { clusterName, credentialId };
  });
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
    if (mockDb.grants.some((g) => g.username === username && g.clusterName === clusterName)) {
      return problem(409, {
        code: 'Grants.AlreadyExists',
        detail: `${username} already has access to ${clusterName} — change the existing grant instead`,
      });
    }

    const grant = createGrant(username, clusterName, credentialId, accessMode);
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
      if (existing && credentialId.trim() !== '') {
        checkCredential(body, 'credentialId', credentialId, existing.clusterName);
      }
      return { accessMode, credentialId, version };
    });
    if (bound.error) return bound.error;
    const { accessMode, credentialId, version } = bound.value;
    if (!existing) return grantNotFound();
    const grant = existing;
    if (version !== grant.version) return conflictProblem('grant');
    if (grant.accessMode === accessMode && grant.credentialId === credentialId) {
      return response(200).json(toGrant(grant));
    }

    const details = {
      oldAccessMode: grant.accessMode,
      newAccessMode: accessMode,
      oldCredential: findCredential(grant.credentialId)?.name ?? null,
      newCredential: findCredential(credentialId)?.name ?? null,
    };
    Object.assign(grant, {
      accessMode,
      credentialId,
      updatedAt: new Date().toISOString(),
      updatedBy: actorName(),
      version: grant.version + 1,
    });
    auditGrant(
      grant,
      'grant.changed',
      `${actorName()} changed ${grant.username}'s access to ${grant.clusterName}.`,
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
      `${actorName()} revoked ${grant.username}'s access to ${grant.clusterName}.`,
      {
        username: grant.username,
        accessMode: grant.accessMode,
        credential: findCredential(grant.credentialId)?.name ?? null,
      },
    );
    return response(204).empty();
  }),

  // GRANT-4: all-or-nothing; per-item problems are 400 field errors keyed `items[i].clusterName|credentialId`.
  // Body validation first, then the route's 404 (the Api's validator runs before the handler).
  http.post('/api/admin/users/{username}/grants/bulk', async ({ params, request, response }) => {
    const bound = await bindBody(request, (body) => ({
      accessMode: body.enumValue('accessMode', 'Access mode', ACCESS_MODES),
      items: bindBulkItems(body, params.username),
    }));
    if (bound.error) return bound.error;
    if (!findUser(params.username)) {
      return problem(404, { code: 'Users.NotFound', detail: `User ${params.username} doesn't exist.` });
    }

    const { accessMode, items } = bound.value;
    const created = items.map((item) =>
      createGrant(params.username, item.clusterName, item.credentialId, accessMode),
    );
    return response(200).json(created.map((grant) => toGrant(grant)));
  }),
];
