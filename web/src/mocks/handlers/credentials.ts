import type { ConnectionTestHint, ConnectionTestResult } from '@/shared/api';
import { actorName, findCluster, findCredential, mockDb, newMockId, recordAudit } from '../db';
import {
  connectionTestFor,
  fingerprintOf,
  type ConnectionTestScenario,
  type MockCredential,
  type MockTestRecord,
} from '../fixtures';
import { conflictProblem, problem } from '../problem';
import { bindBody, DNS_LABEL, type BodyBinder } from './body';
import { clusterNotFound } from './adminClusters';
import { http } from './http';
import { credentialsOfCluster, ordinal, toCredential } from './representations';

/** 404 `Credentials.NotFound` (unknown id, or it belongs to another cluster). */
function credentialNotFound() {
  return problem(404, { code: 'Credentials.NotFound', detail: "Credential doesn't exist." });
}

/** CRED-1 token rules: trimmed, required, no internal whitespace, ≤ 16384 chars. Returns the trimmed token. */
function bindToken(body: BodyBinder): string {
  const token = body.requiredString('token', 'Token').trim();
  if (/\s/.test(token)) body.error('token', 'The token must not contain spaces or line breaks.');
  if (token.length > 16384) body.error('token', 'The token must be at most 16384 characters.');
  return token;
}

/** Optional `inspectNamespace` (DNS label, ≤ 63). */
function bindInspectNamespace(body: BodyBinder): string | null {
  const namespace = body.optionalString('inspectNamespace');
  if (namespace !== null && (namespace.length > 63 || !DNS_LABEL.test(namespace))) {
    body.error('inspectNamespace', 'Enter a valid namespace name.');
  }
  return namespace;
}

/** Token-derived credential fields, decoding the JWT payload the way the Api does (no signature check). */
type TokenFacts = Pick<
  MockCredential,
  'fingerprint' | 'tokenType' | 'serviceAccount' | 'subject' | 'issuedAt' | 'expiresAt'
>;

/** Reads `sub`/`iat`/`exp` from a JWT; anything that doesn't decode is an opaque token (accepted, Q10). */
function inspectToken(token: string): TokenFacts {
  const opaque: TokenFacts = {
    fingerprint: fingerprintOf(token),
    tokenType: 'opaque',
    serviceAccount: null,
    subject: null,
    issuedAt: null,
    expiresAt: null,
  };
  const payload = token.split('.')[1];
  if (token.split('.').length !== 3 || !payload) return opaque;
  try {
    const claims: unknown = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/')));
    if (typeof claims !== 'object' || claims === null) return opaque;
    const { sub, iat, exp } = claims as Record<string, unknown>;
    const subject = typeof sub === 'string' ? sub : null;
    const saMatch = subject ? /^system:serviceaccount:([^:]+):([^:]+)$/.exec(subject) : null;
    const time = (value: unknown) =>
      typeof value === 'number' ? new Date(value * 1000).toISOString() : null;
    return {
      ...opaque,
      tokenType: 'jwt',
      subject,
      serviceAccount: saMatch ? `${saMatch[1] ?? ''}/${saMatch[2] ?? ''}` : null,
      issuedAt: time(iat),
      expiresAt: time(exp),
    };
  } catch {
    return opaque;
  }
}

/** Test outcome by token prefix: `bad-…` → rejected at authentication, `tls-…` → TLS failure, else passes. */
function scenarioForToken(token: string, passing: ConnectionTestScenario = 'view'): ConnectionTestScenario {
  if (token.startsWith('bad-')) return 'authFailure';
  if (token.startsWith('tls-')) return 'tlsFailure';
  return passing;
}

/** TEST-4 hints from the credential's grants (none for an unsaved token without `credentialId`). */
function hintsFor(
  result: ConnectionTestResult,
  credential: MockCredential | undefined,
): ConnectionTestHint[] {
  if (!credential || !result.capabilities) return [];
  const grants = mockDb.grants.filter((grant) => grant.credentialId === credential.id);
  const readWrite = grants.filter((grant) => grant.accessMode === 'readWrite').length;
  const hints: ConnectionTestHint[] = [];
  const cannotWrite = result.capabilities.checks.some(
    (check) => check.category === 'write' && !check.allowed,
  );
  if (readWrite > 0 && cannotWrite) {
    hints.push({
      severity: 'warning',
      message: `${readWrite} users have ReadWrite grants with this credential but it cannot modify workloads`,
    });
  }
  if (result.capabilities.headline === 'clusterAdmin' && grants.length > readWrite) {
    hints.push({
      severity: 'info',
      message: "This credential is cluster-admin; ReadOnly grants rely on FleetConsole's read-only guard",
    });
  }
  return hints;
}

/** What `lastTest` stores from a full result (TEST-5). */
function toTestRecord(result: ConnectionTestResult): MockTestRecord {
  return {
    testedAt: result.testedAt,
    succeeded: result.succeeded,
    failedStep: result.steps.find((step) => step.status === 'failed')?.step ?? null,
    headline: result.capabilities?.headline ?? null,
  };
}

/** Audits a change of `credential` by the signed-in user. */
function auditCredential(
  credential: MockCredential,
  action: string,
  summary: string,
  details: Record<string, unknown>,
) {
  recordAudit({
    action,
    category: 'credentials',
    targetType: 'credential',
    targetId: credential.id,
    targetName: `${credential.clusterName}/${credential.name}`,
    clusterName: credential.clusterName,
    summary,
    details,
  });
}

/** Credentials and connection tests (contract §8.4, §8.5). */
export const credentialHandlers = [
  // CRED-7: soonest expiry first (nulls last), then cluster, then name.
  http.get('/api/admin/credentials', ({ response }) => {
    const sorted = [...mockDb.credentials].sort((a, b) => {
      if (a.expiresAt !== b.expiresAt) {
        if (a.expiresAt === null) return 1;
        if (b.expiresAt === null) return -1;
        return Date.parse(a.expiresAt) - Date.parse(b.expiresAt);
      }
      return ordinal(a.clusterName, b.clusterName) || ordinal(a.name, b.name);
    });
    return response(200).json(sorted.map((credential) => toCredential(credential)));
  }),

  http.get('/api/admin/clusters/{name}/credentials', ({ params, response }) => {
    if (!findCluster(params.name)) return clusterNotFound(params.name);
    return response(200).json(
      credentialsOfCluster(params.name).map((credential) => toCredential(credential)),
    );
  }),

  http.post('/api/admin/clusters/{name}/credentials', async ({ params, request, response }) => {
    const bound = await bindBody(request, (body) => {
      const name = body.requiredString('name', 'Name');
      if (name.trim() !== '' && (name.length > 63 || !DNS_LABEL.test(name))) {
        body.error(
          'name',
          "Use lowercase letters, digits and '-' (max 63), starting and ending with a letter or digit.",
        );
      }
      const description = body.optionalString('description');
      if (description !== null && description.length > 1000) {
        body.error('description', 'Description must be at most 1000 characters.');
      }
      return { name, description, token: bindToken(body) };
    });
    if (bound.error) return bound.error;
    const { name, description, token } = bound.value;
    if (!findCluster(params.name)) return clusterNotFound(params.name);
    if (mockDb.credentials.some((c) => c.clusterName === params.name && c.name === name)) {
      return problem(409, {
        code: 'Credentials.NameTaken',
        detail: `A credential named ${name} already exists on ${params.name}.`,
      });
    }

    const now = new Date().toISOString();
    const credential: MockCredential = {
      ...inspectToken(token),
      id: newMockId(),
      clusterName: params.name,
      name,
      description,
      createdAt: now,
      createdBy: actorName(),
      rotatedAt: null,
      rotatedBy: null,
      lastTest: null,
      testScenario: scenarioForToken(token),
      version: 1,
    };
    mockDb.credentials.push(credential);
    auditCredential(
      credential,
      'credential.added',
      `${actorName()} added credential ${name} to ${params.name}.`,
      {
        fingerprint: credential.fingerprint,
        tokenType: credential.tokenType,
        serviceAccount: credential.serviceAccount,
      },
    );
    return response(201).json(toCredential(credential), {
      headers: { Location: `/api/admin/clusters/${params.name}/credentials/${credential.id}` },
    });
  }),

  // CRED-5: keeps id and grants; no test is run. The previous test described the old token, so it is cleared.
  http.put(
    '/api/admin/clusters/{name}/credentials/{credentialId}/token',
    async ({ params, request, response }) => {
      const bound = await bindBody(request, (body) => ({ token: bindToken(body), version: body.version() }));
      if (bound.error) return bound.error;
      const { token, version } = bound.value;
      if (!findCluster(params.name)) return clusterNotFound(params.name);
      const credential = findCredential(params.credentialId, params.name);
      if (!credential) return credentialNotFound();
      if (version !== credential.version) return conflictProblem('credential');

      const oldFingerprint = credential.fingerprint;
      Object.assign(credential, inspectToken(token), {
        rotatedAt: new Date().toISOString(),
        rotatedBy: actorName(),
        lastTest: null,
        testScenario: scenarioForToken(token, credential.testScenario),
        version: credential.version + 1,
      });
      auditCredential(
        credential,
        'credential.rotated',
        `${actorName()} rotated the token of ${params.name}/${credential.name}.`,
        { oldFingerprint, newFingerprint: credential.fingerprint },
      );
      return response(200).json(toCredential(credential));
    },
  ),

  // CRED-6: refused while grants use the credential.
  http.delete('/api/admin/clusters/{name}/credentials/{credentialId}', ({ params, response }) => {
    if (!findCluster(params.name)) return clusterNotFound(params.name);
    const credential = findCredential(params.credentialId, params.name);
    if (!credential) return credentialNotFound();
    const inUse = mockDb.grants.filter((grant) => grant.credentialId === credential.id).length;
    if (inUse > 0) {
      return problem(409, {
        code: 'Credentials.InUse',
        detail: `Credential ${credential.name} is used by ${inUse} grants. Re-assign or revoke them first.`,
      });
    }
    mockDb.credentials = mockDb.credentials.filter((c) => c !== credential);
    auditCredential(
      credential,
      'credential.deleted',
      `${actorName()} deleted credential ${credential.name} of ${params.name}.`,
      {
        fingerprint: credential.fingerprint,
      },
    );
    return response(204).empty();
  }),

  // Canned result by credential (fixtures' `testScenario`), stored as the credential's last test (TEST-5).
  http.post(
    '/api/admin/clusters/{name}/credentials/{credentialId}/test',
    async ({ params, request, response }) => {
      const bound = await bindBody(request, (body) => bindInspectNamespace(body));
      if (bound.error) return bound.error;
      const inspectNamespace = bound.value;
      if (!findCluster(params.name)) return clusterNotFound(params.name);
      const credential = findCredential(params.credentialId, params.name);
      if (!credential) return credentialNotFound();

      const canned = connectionTestFor(credential.testScenario, credential.serviceAccount, inspectNamespace);
      const result = { ...canned, hints: hintsFor(canned, credential) };
      credential.lastTest = toTestRecord(result);
      auditCredential(
        credential,
        'credential.tested',
        `${actorName()} tested ${params.name}/${credential.name}: ${result.succeeded ? 'passed' : 'failed'}.`,
        {
          succeeded: result.succeeded,
          failedStep: credential.lastTest.failedStep,
          headline: credential.lastTest.headline,
        },
      );
      return response(200).json(result);
    },
  ),

  // Unsaved token: result by token prefix (`bad-` / `tls-` fail), nothing stored.
  http.post('/api/admin/clusters/{name}/test-token', async ({ params, request, response }) => {
    // Validation first (the credential must belong to the route's cluster), then the route's 404 — the Api order.
    const bound = await bindBody(request, (body) => {
      const token = bindToken(body);
      const inspectNamespace = bindInspectNamespace(body);
      const credentialId = body.optionalString('credentialId');
      const credential = credentialId === null ? undefined : findCredential(credentialId);
      if (credentialId !== null && !credential) body.error('credentialId', "Credential doesn't exist.");
      if (credential && credential.clusterName !== params.name) {
        body.error('credentialId', 'This credential belongs to another cluster.');
      }
      return { token, inspectNamespace, credential };
    });
    if (bound.error) return bound.error;
    const { token, inspectNamespace, credential } = bound.value;
    const cluster = findCluster(params.name);
    if (!cluster) return clusterNotFound(params.name);

    const facts = inspectToken(token);
    const canned = connectionTestFor(scenarioForToken(token), facts.serviceAccount, inspectNamespace);
    const result = { ...canned, hints: hintsFor(canned, credential) };
    const record = toTestRecord(result);
    recordAudit({
      action: 'credential.token_tested',
      category: 'credentials',
      targetType: 'cluster',
      targetId: cluster.name,
      targetName: cluster.name,
      clusterName: cluster.name,
      summary: `${actorName()} tested an unsaved token against ${cluster.name}.`,
      details: {
        succeeded: record.succeeded,
        failedStep: record.failedStep,
        headline: record.headline,
        fingerprint: facts.fingerprint,
      },
    });
    return response(200).json(result);
  }),
];
