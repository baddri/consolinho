import type { AuditEntry } from '@/shared/api';
import {
  auditFixtures,
  clusterFixtures,
  credentialFixtures,
  grantFixtures,
  hostGroupsFixture,
  mockGuid,
  userFixtures,
  type MockCluster,
  type MockCredential,
  type MockGrant,
  type MockHostGroup,
  type MockHostGroups,
  type MockUser,
} from './fixtures';
import { resetK8sStore } from './k8s/store';
import { getMockUser } from './session';

/** The stateful in-memory store of the mock backend. Handlers mutate it; tests may read it to assert side effects. */
export interface MockDb {
  users: MockUser[];
  clusters: MockCluster[];
  credentials: MockCredential[];
  grants: MockGrant[];
  /** The host cluster's groups as last read by FleetConsole (ADR-0039); see {@link setMockHostGroups}. */
  hostGroups: MockHostGroups;
  /** Newest first. */
  audit: AuditEntry[];
}

/** Fresh deep copy of the fixtures, so mutations never leak into the fixture constants. */
function seed(): MockDb {
  return structuredClone({
    users: [...userFixtures],
    clusters: [...clusterFixtures],
    credentials: [...credentialFixtures],
    grants: [...grantFixtures],
    hostGroups: hostGroupsFixture,
    audit: [...auditFixtures],
  });
}

/** The live store. Its identity is stable; {@link resetMockDb} replaces its contents. */
export const mockDb: MockDb = seed();

const FIRST_RUNTIME_ID = 0x900000;
let nextId = FIRST_RUNTIME_ID;

/**
 * Drops every credential and grant of cluster `name`, for tests of the "no credentials" / "nobody has access" states
 * now that every fixture cluster has at least one credential (lab-1 got one in T-0147). Undone by {@link resetMockDb}.
 */
export function clearClusterAccess(name: string): void {
  mockDb.credentials = mockDb.credentials.filter((credential) => credential.clusterName !== name);
  mockDb.grants = mockDb.grants.filter((grant) => grant.clusterName !== name);
}

/**
 * Test helper: a host status (`'forbidden'`/`'unavailable'` = listing failed, the groups become unknown) or the host
 * groups themselves (status `ok`). Undone by {@link resetMockDb}.
 */
export function setMockHostGroups(update: MockHostGroups['status'] | MockHostGroup[]): void {
  mockDb.hostGroups =
    typeof update === 'string'
      ? { ...mockDb.hostGroups, status: update }
      : { status: 'ok', readAt: new Date().toISOString(), groups: structuredClone(update) };
}

/** Restores the fixture state, including the mock clusters' objects, and closes open watches (`test/setup.ts`). */
export function resetMockDb(): void {
  Object.assign(mockDb, seed());
  resetK8sStore();
  nextId = FIRST_RUNTIME_ID;
}

/** A new deterministic GUID for an entity created at runtime. */
export function newMockId(): string {
  nextId += 1;
  return mockGuid(nextId);
}

/** User by exact (case-sensitive) username. */
export function findUser(username: string): MockUser | undefined {
  return mockDb.users.find((user) => user.username === username);
}

/** Cluster by name. */
export function findCluster(name: string): MockCluster | undefined {
  return mockDb.clusters.find((cluster) => cluster.name === name);
}

/** Credential by id, optionally only when it belongs to `clusterName` (contract §2 `Credentials.NotFound`). */
export function findCredential(id: string, clusterName?: string): MockCredential | undefined {
  return mockDb.credentials.find(
    (credential) =>
      credential.id === id && (clusterName === undefined || credential.clusterName === clusterName),
  );
}

/** Host group by exact (case-sensitive) name; `undefined` also when the host listing failed. */
export function findHostGroup(name: string): MockHostGroup | undefined {
  return mockDb.hostGroups.status === 'ok'
    ? mockDb.hostGroups.groups.find((group) => group.name === name)
    : undefined;
}

/** Grant by id. */
export function findGrant(id: string): MockGrant | undefined {
  return mockDb.grants.find((grant) => grant.id === id);
}

/** The signed-in user, or `undefined` when signed out, unknown or deactivated (session ended, contract §1). */
export function currentMockUser(): MockUser | undefined {
  const username = getMockUser();
  const user = username === null ? undefined : findUser(username);
  return user?.status === 'deactivated' ? undefined : user;
}

/**
 * Username of the signed-in user for `createdBy`/`updatedBy`/summaries. Route handlers only run after the access
 * guard established a session, so the fallback is never seen in practice.
 */
export function actorName(): string {
  return currentMockUser()?.username ?? 'unknown';
}

/** Effective admin: by assignment or via configuration (ADR-0009). */
export function isAdmin(user: MockUser): boolean {
  return user.isAdminByAssignment || user.adminConfigurationSource !== null;
}

/** Fields of an audit entry a handler supplies; id, time, actor and correlation id are filled in. */
export type AuditInput = Pick<
  AuditEntry,
  'action' | 'category' | 'targetType' | 'targetId' | 'targetName' | 'clusterName' | 'summary' | 'details'
>;

/** Appends an audit entry for an action of the signed-in user (the Api writes it in the same transaction, ADR-0008). */
export function recordAudit(entry: AuditInput): void {
  const id = newMockId();
  mockDb.audit.unshift({
    ...entry,
    id,
    occurredAt: new Date().toISOString(),
    actor: getMockUser() ?? 'anonymous',
    actorIsSystem: false,
    correlationId: id.replaceAll('-', ''),
  });
}
