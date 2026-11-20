import type { AuditCategory, AuditEntry, AuditTargetType } from '@/shared/api';
import { proxyAuditInput, type ProxyMutation } from '../k8s/proxyAudit';
import { mockGuid } from './ids';
import { FIXTURE_NOW } from './time';

/** Number of generated audit entries (≥ 120 so the audit page needs several pages at the default limit of 50). */
export const AUDIT_FIXTURE_COUNT = 132;

/** Minutes between two consecutive generated entries (132 entries ≈ 4.5 days of history). */
const SPACING_MINUTES = 49;

const USERS = ['alice', 'bob', 'carol', 'ines', 'pending-paul', 'dave'] as const;
const CLUSTERS = ['prod-eu-1', 'prod-us-1', 'staging-eu-1', 'dev-1', 'dev-2', 'lab-1'] as const;
const CREDENTIALS = ['fleet-view', 'fleet-edit', 'fleet-admin'] as const;

/** What a template contributes to an entry; ids, time, correlation id and category are added by the generator. */
interface AuditTemplateResult {
  actor: string;
  targetId: string | null;
  targetName: string;
  clusterName: string | null;
  summary: string;
  details: Record<string, unknown>;
}

interface AuditTemplate {
  action: string;
  category: AuditCategory;
  targetType: AuditTargetType;
  /** `n` = how often this template has been used before; picks users/clusters round-robin. */
  build: (n: number) => AuditTemplateResult;
}

const pick = <T>(list: readonly T[], n: number): T => list[n % list.length] as T;

/** A proxy entry built exactly like the mock proxy records it (contract §5). */
function proxyEntry(actor: string, mutation: ProxyMutation): AuditTemplateResult {
  const { targetId, targetName, clusterName, summary, details } = proxyAuditInput(actor, mutation);
  return { actor, targetId, targetName, clusterName, summary, details };
}

/** One template per action of contract §10 (AUD-1), plus proxy actions of CP2 contract §5 (PAUD-4). */
const TEMPLATES: readonly AuditTemplate[] = [
  {
    action: 'auth.login',
    category: 'auth',
    targetType: 'session',
    build: (n) => {
      const user = pick(USERS, n);
      return {
        actor: user,
        targetId: null,
        targetName: user,
        clusterName: null,
        summary: `${user} logged in.`,
        details: { groups: user === 'alice' ? ['sre'] : [], provisioned: false },
      };
    },
  },
  {
    action: 'auth.login_denied',
    category: 'auth',
    targetType: 'session',
    build: (n) => {
      const user = n % 2 === 0 ? 'dave' : 'mallory';
      const reason = user === 'dave' ? 'deactivated' : 'notRegistered';
      return {
        actor: user,
        targetId: null,
        targetName: user,
        clusterName: null,
        summary: `Login denied for ${user} (${reason}).`,
        details: { reason },
      };
    },
  },
  {
    action: 'auth.logout',
    category: 'auth',
    targetType: 'session',
    build: (n) => {
      const user = pick(USERS, n + 2);
      return {
        actor: user,
        targetId: null,
        targetName: user,
        clusterName: null,
        summary: `${user} logged out.`,
        details: {},
      };
    },
  },
  {
    action: 'user.provisioned',
    category: 'users',
    targetType: 'user',
    build: (n) => {
      const user = `new-user-${n + 1}`;
      return {
        actor: user,
        targetId: user,
        targetName: user,
        clusterName: null,
        summary: `${user} was provisioned at first login.`,
        details: { source: 'login' },
      };
    },
  },
  {
    action: 'user.created',
    category: 'users',
    targetType: 'user',
    build: (n) => {
      const user = pick(USERS, n + 4);
      return {
        actor: 'carol',
        targetId: user,
        targetName: user,
        clusterName: null,
        summary: `carol created user ${user}.`,
        details: { role: 'user', isReadOnly: false },
      };
    },
  },
  {
    action: 'user.promoted',
    category: 'users',
    targetType: 'user',
    build: (n) =>
      n % 2 === 0
        ? {
            actor: 'system (config)',
            targetId: 'admin',
            targetName: 'admin',
            clusterName: null,
            summary: 'admin became an administrator through group fleetconsole-admins.',
            details: { source: 'configuration', configurationSource: 'group fleetconsole-admins' },
          }
        : {
            actor: 'admin',
            targetId: 'carol',
            targetName: 'carol',
            clusterName: null,
            summary: 'admin promoted carol to administrator.',
            details: { source: 'manual', configurationSource: null },
          },
  },
  {
    action: 'user.demoted',
    category: 'users',
    targetType: 'user',
    build: () => ({
      actor: 'admin',
      targetId: 'bob',
      targetName: 'bob',
      clusterName: null,
      summary: 'admin demoted bob to user.',
      details: { source: 'manual', configurationSource: null },
    }),
  },
  {
    action: 'user.deactivated',
    category: 'users',
    targetType: 'user',
    build: () => ({
      actor: 'admin',
      targetId: 'dave',
      targetName: 'dave',
      clusterName: null,
      summary: 'admin deactivated dave.',
      details: {},
    }),
  },
  {
    action: 'user.reactivated',
    category: 'users',
    targetType: 'user',
    build: () => ({
      actor: 'carol',
      targetId: 'dave',
      targetName: 'dave',
      clusterName: null,
      summary: 'carol reactivated dave.',
      details: {},
    }),
  },
  {
    action: 'user.read_only_changed',
    category: 'users',
    targetType: 'user',
    build: (n) => ({
      actor: 'admin',
      targetId: 'ines',
      targetName: 'ines',
      clusterName: null,
      summary: `admin made ines ${n % 2 === 0 ? 'read-only' : 'writable'}.`,
      details: { isReadOnly: n % 2 === 0 },
    }),
  },
  {
    action: 'cluster.registered',
    category: 'clusters',
    targetType: 'cluster',
    build: (n) => {
      const cluster = pick(CLUSTERS, n);
      return {
        actor: 'admin',
        targetId: cluster,
        targetName: cluster,
        clusterName: cluster,
        summary: `admin registered cluster ${cluster}.`,
        details: {
          environment: cluster.startsWith('prod') ? 'production' : 'development',
          apiUrl: `https://api.${cluster}.example.com:6443`,
          tlsMode: 'systemTrust',
          isEnabled: true,
        },
      };
    },
  },
  {
    action: 'cluster.updated',
    category: 'clusters',
    targetType: 'cluster',
    build: (n) => {
      const cluster = pick(CLUSTERS, n + 1);
      return {
        actor: 'carol',
        targetId: cluster,
        targetName: cluster,
        clusterName: cluster,
        summary: `carol updated cluster ${cluster}.`,
        details: { changedFields: n % 2 === 0 ? ['description'] : ['apiUrl', 'caBundle'] },
      };
    },
  },
  {
    action: 'cluster.disabled',
    category: 'clusters',
    targetType: 'cluster',
    build: () => ({
      actor: 'admin',
      targetId: 'dev-2',
      targetName: 'dev-2',
      clusterName: 'dev-2',
      summary: 'admin disabled cluster dev-2.',
      details: {},
    }),
  },
  {
    action: 'cluster.enabled',
    category: 'clusters',
    targetType: 'cluster',
    build: () => ({
      actor: 'admin',
      targetId: 'dev-2',
      targetName: 'dev-2',
      clusterName: 'dev-2',
      summary: 'admin enabled cluster dev-2.',
      details: {},
    }),
  },
  {
    action: 'cluster.deleted',
    category: 'clusters',
    targetType: 'cluster',
    build: (n) => {
      const cluster = `old-lab-${n + 1}`;
      return {
        actor: 'admin',
        targetId: cluster,
        targetName: cluster,
        clusterName: cluster,
        summary: `admin deleted cluster ${cluster}.`,
        details: { credentialCount: 1, grantCount: n % 3 },
      };
    },
  },
  {
    action: 'credential.added',
    category: 'credentials',
    targetType: 'credential',
    build: (n) => {
      const cluster = pick(CLUSTERS, n);
      const credential = pick(CREDENTIALS, n);
      return {
        actor: 'carol',
        targetId: mockGuid(0x300 + n),
        targetName: `${cluster}/${credential}`,
        clusterName: cluster,
        summary: `carol added credential ${credential} to ${cluster}.`,
        details: { fingerprint: '3fa9c2d1', tokenType: 'jwt', serviceAccount: `fleetconsole/${credential}` },
      };
    },
  },
  {
    action: 'credential.rotated',
    category: 'credentials',
    targetType: 'credential',
    build: (n) => {
      const cluster = pick(CLUSTERS, n + 2);
      return {
        actor: 'admin',
        targetId: mockGuid(0x400 + n),
        targetName: `${cluster}/fleet-view`,
        clusterName: cluster,
        summary: `admin rotated the token of ${cluster}/fleet-view.`,
        details: { oldFingerprint: '0b1c2d3e', newFingerprint: '9e8d7c6b' },
      };
    },
  },
  {
    action: 'credential.deleted',
    category: 'credentials',
    targetType: 'credential',
    build: (n) => ({
      actor: 'admin',
      targetId: mockGuid(0x500 + n),
      targetName: 'dev-1/old-token',
      clusterName: 'dev-1',
      summary: 'admin deleted credential old-token of dev-1.',
      details: { fingerprint: 'aa11bb22' },
    }),
  },
  {
    action: 'credential.tested',
    category: 'credentials',
    targetType: 'credential',
    build: (n) => {
      const cluster = pick(CLUSTERS, n + 3);
      const succeeded = n % 3 !== 0;
      return {
        actor: 'carol',
        targetId: mockGuid(0x600 + n),
        targetName: `${cluster}/fleet-view`,
        clusterName: cluster,
        summary: `carol tested ${cluster}/fleet-view: ${succeeded ? 'passed' : 'failed'}.`,
        details: {
          succeeded,
          failedStep: succeeded ? null : 'authentication',
          headline: succeeded ? 'clusterWideView' : null,
        },
      };
    },
  },
  {
    action: 'credential.token_tested',
    category: 'credentials',
    targetType: 'cluster',
    build: (n) => {
      const cluster = pick(CLUSTERS, n + 4);
      return {
        actor: 'admin',
        targetId: cluster,
        targetName: cluster,
        clusterName: cluster,
        summary: `admin tested an unsaved token against ${cluster}.`,
        details: { succeeded: true, failedStep: null, headline: 'clusterWideEdit', fingerprint: 'c0ffee42' },
      };
    },
  },
  {
    action: 'grant.created',
    category: 'grants',
    targetType: 'grant',
    build: (n) => {
      const user = pick(USERS, n);
      const cluster = pick(CLUSTERS, n + 1);
      return {
        actor: 'admin',
        targetId: mockGuid(0x700 + n),
        targetName: `${user} → ${cluster}`,
        clusterName: cluster,
        summary: `admin granted ${user} read-only access to ${cluster}.`,
        details: { username: user, accessMode: 'readOnly', credential: 'fleet-view' },
      };
    },
  },
  {
    action: 'grant.changed',
    category: 'grants',
    targetType: 'grant',
    build: (n) => {
      const user = pick(USERS, n + 1);
      const cluster = pick(CLUSTERS, n);
      return {
        actor: 'carol',
        targetId: mockGuid(0x800 + n),
        targetName: `${user} → ${cluster}`,
        clusterName: cluster,
        summary: `carol changed ${user}'s access to ${cluster} to read-write.`,
        details: {
          oldAccessMode: 'readOnly',
          newAccessMode: 'readWrite',
          oldCredential: 'fleet-view',
          newCredential: 'fleet-edit',
        },
      };
    },
  },
  {
    action: 'grant.revoked',
    category: 'grants',
    targetType: 'grant',
    build: (n) => {
      const user = pick(USERS, n + 3);
      const cluster = pick(CLUSTERS, n + 2);
      return {
        actor: 'admin',
        targetId: mockGuid(0x880 + n),
        targetName: `${user} → ${cluster}`,
        clusterName: cluster,
        summary: `admin revoked ${user}'s access to ${cluster}.`,
        details: { username: user, accessMode: 'readOnly', credential: 'fleet-view' },
      };
    },
  },
  // Proxy entries (CP2 contract §5): dev-1 always has an allowed PUT and a read-only-grant denial (PAUD-4).
  {
    action: 'proxy.update',
    category: 'proxy',
    targetType: 'kubernetesResource',
    build: () =>
      proxyEntry('alice', {
        cluster: 'dev-1',
        method: 'PUT',
        path: '/api/v1/namespaces/shop/configmaps/web',
        status: 200,
        reason: null,
      }),
  },
  {
    action: 'proxy.delete',
    category: 'proxy',
    targetType: 'kubernetesResource',
    build: (n) =>
      proxyEntry('bob', {
        cluster: 'dev-1',
        method: 'DELETE',
        path: `/api/v1/namespaces/shop/pods/web-${n + 1}`,
        status: 403,
        reason: 'readOnlyGrant',
      }),
  },
  {
    action: 'proxy.patch',
    category: 'proxy',
    targetType: 'kubernetesResource',
    build: (n) =>
      proxyEntry(pick(USERS, n), {
        cluster: pick(CLUSTERS, n),
        method: 'PATCH',
        path: '/apis/apps/v1/namespaces/shop/deployments/web/scale',
        status: n % 3 === 2 ? 409 : 200,
        reason: null,
      }),
  },
];

/** 32 lowercase hex chars derived from `n` — a deterministic W3C trace id. */
function correlationId(n: number): string {
  return n.toString(16).padStart(8, '0').repeat(4);
}

/**
 * Generates {@link AUDIT_FIXTURE_COUNT} audit entries, newest first, cycling through every action of contract §10.
 * Deterministic: the same index always yields the same entry (only the timestamps follow the fixture clock).
 */
function generateAuditEntries(): AuditEntry[] {
  return Array.from({ length: AUDIT_FIXTURE_COUNT }, (_, index) => {
    const template = pick(TEMPLATES, index);
    const built = template.build(Math.floor(index / TEMPLATES.length));
    return {
      id: mockGuid(0xa000 + index),
      occurredAt: new Date(FIXTURE_NOW - (index + 1) * SPACING_MINUTES * 60_000).toISOString(),
      actor: built.actor,
      actorIsSystem: built.actor === 'system (config)',
      action: template.action,
      category: template.category,
      targetType: template.targetType,
      targetId: built.targetId,
      targetName: built.targetName,
      clusterName: built.clusterName,
      summary: built.summary,
      correlationId: correlationId(index + 1),
      details: built.details,
    };
  });
}

/** Generated audit log, newest first. */
export const auditFixtures: readonly AuditEntry[] = generateAuditEntries();
