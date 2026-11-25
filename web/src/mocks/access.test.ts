import { getResponse } from 'msw';
import { apiClient, CSRF_HEADER, unwrap, unwrapNoContent } from '@/shared/api';
import { accessGuard, unhandledApiRoute } from './handlers/http';
import { expectApiError } from '@/test/apiError';
import {
  credentialIds,
  mockDb,
  resolveAccess,
  setMockUser,
  type MockGrant,
} from '@/test/handlers';

const url = (path: string) => new URL(path, globalThis.location.origin).toString();

describe('mock access guard (contract §1, §2)', () => {
  it('rejects a non-GET request without the CSRF header before anything else (403 Auth.CsrfHeaderMissing)', async () => {
    setMockUser(null); // CSRF wins even over the missing session

    const response = await fetch(url('/api/admin/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'eve' }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('Content-Type')).toContain('application/problem+json');
    const body = (await response.json()) as { code: string; traceId: string };
    expect(body.code).toBe('Auth.CsrfHeaderMissing');
    expect(body.traceId).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-00$/);
  });

  it('accepts the same request with the header (apiClient sends it)', async () => {
    const response = await fetch(url('/api/auth/logout'), {
      method: 'POST',
      headers: { [CSRF_HEADER]: '1' },
    });
    expect(response.status).toBe(204);
  });

  it('answers 401 Auth.Unauthenticated on authenticated endpoints when signed out', async () => {
    setMockUser(null);

    const me = await expectApiError(unwrap(apiClient.GET('/api/auth/me')));
    const clusters = await expectApiError(unwrap(apiClient.GET('/api/clusters')));

    expect([me.status, me.code]).toEqual([401, 'Auth.Unauthenticated']);
    expect([clusters.status, clusters.code]).toEqual([401, 'Auth.Unauthenticated']);
  });

  it('keeps anonymous endpoints open when signed out', async () => {
    setMockUser(null);

    await expect(unwrap(apiClient.GET('/api/system/info'))).resolves.toMatchObject({ environment: 'Test' });
    await expect(unwrapNoContent(apiClient.POST('/api/auth/logout'))).resolves.toBeUndefined();
  });

  it('treats a deactivated user as an ended session (401)', async () => {
    setMockUser('dave');
    const error = await expectApiError(unwrap(apiClient.GET('/api/auth/me')));
    expect(error.status).toBe(401);
  });

  it('forbids non-admins on /api/admin/** (403 Auth.Forbidden)', async () => {
    setMockUser('alice');

    const error = await expectApiError(unwrap(apiClient.GET('/api/admin/users')));

    expect([error.status, error.code]).toEqual([403, 'Auth.Forbidden']);
    expect(error.detail).toBe("You don't have access to Fleet administration.");
  });

  it('lets a read-only admin read but not run commands (403 Auth.ReadOnly), including connection tests', async () => {
    setMockUser('ines');

    await expect(unwrap(apiClient.GET('/api/admin/users'))).resolves.toHaveLength(7);
    await expect(unwrap(apiClient.GET('/api/admin/audit'))).resolves.toHaveProperty('items');
    const create = await expectApiError(
      unwrap(apiClient.POST('/api/admin/users', { body: { username: 'eve' } })),
    );
    const test = await expectApiError(
      unwrap(
        apiClient.POST('/api/admin/clusters/{name}/test-token', {
          params: { path: { name: 'prod-eu-1' } },
          body: { token: 'abc', credentialId: null, inspectNamespaces: null },
        }),
      ),
    );

    expect([create.status, create.code]).toEqual([403, 'Auth.ReadOnly']);
    expect(test.code).toBe('Auth.ReadOnly');
  });

  it('logout ends the mock session', async () => {
    await unwrapNoContent(apiClient.POST('/api/auth/logout'));

    const error = await expectApiError(unwrap(apiClient.GET('/api/auth/me')));
    expect(error.status).toBe(401);
  });

  it('fails routes outside the contract like unhandled requests (logged, fetch rejects)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(fetch(url('/api/admin/not-a-route'))).rejects.toThrow();
    await expect(fetch(url('/api/clusters/prod-eu-1/not-a-route'))).rejects.toThrow();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('No mock handler for GET /api/admin/not-a-route'),
    );
  });

  it('leaves non-Api paths that contain /api/ (Vite modules) to the network (T-0361)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // The two catch-all handlers that match every `/api/` segment; neither may answer a module request.
    const response = await getResponse(
      [accessGuard, unhandledApiRoute],
      new Request(url('/src/features/fleet/api/useFleetRows.ts')),
    );

    expect(response).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });
});

/** A grant on prod-us-1 (only `ines` holds a direct grant there in the fixtures). */
function onProdUs(
  id: string,
  subject: Pick<MockGrant, 'subjectKind' | 'subjectName' | 'priority' | 'accessMode'>,
): MockGrant {
  return {
    id,
    ...subject,
    clusterName: 'prod-us-1',
    credentialId: credentialIds.prodUsView,
    grantedAt: '2026-11-01T00:00:00Z',
    grantedBy: 'admin',
    updatedAt: null,
    updatedBy: null,
    version: 1,
  };
}

const direct = (id: string, accessMode: MockGrant['accessMode']) =>
  onProdUs(id, { subjectKind: 'user', subjectName: 'bob', priority: null, accessMode });
const viaGroup = (id: string, group: string, priority: number, accessMode: MockGrant['accessMode']) =>
  onProdUs(id, { subjectKind: 'group', subjectName: group, priority, accessMode });

/** A fixture user (fails the test when the fixtures lack it). */
function userNamed(username: string) {
  const user = mockDb.users.find((u) => u.username === username);
  if (!user) throw new Error(`fixture user ${username} missing`);
  return user;
}

interface ResolveCase {
  name: string;
  groups: string[];
  isReadOnly?: boolean;
  grants: MockGrant[];
  /** Expected: `undefined` for no access, else winner id, mode, narrowed flag and loser outcomes. */
  expected?: { winner: string; mode: string; narrowed: boolean; losers: [string, string, string | null][] };
}

const cases: ResolveCase[] = [
  {
    name: 'direct grant beats any group grant (PREC-3)',
    groups: ['sre'],
    grants: [viaGroup('g1', 'sre', 900, 'readWrite'), direct('u1', 'readOnly')],
    expected: { winner: 'u1', mode: 'readOnly', narrowed: false, losers: [['g1', 'overriddenByDirectGrant', null]] },
  },
  {
    name: 'higher priority group wins (PREC-4)',
    groups: ['sre', 'platform'],
    grants: [viaGroup('g1', 'sre', 100, 'readOnly'), viaGroup('g2', 'platform', 200, 'readWrite')],
    expected: { winner: 'g2', mode: 'readWrite', narrowed: false, losers: [['g1', 'lowerPriority', 'platform']] },
  },
  {
    name: 'tie: read-only wins (PREC-5)',
    groups: ['sre', 'platform'],
    grants: [viaGroup('g1', 'sre', 100, 'readWrite'), viaGroup('g2', 'platform', 100, 'readOnly')],
    expected: { winner: 'g2', mode: 'readOnly', narrowed: false, losers: [['g1', 'tieReadOnlyWins', 'platform']] },
  },
  {
    name: 'tie with the same mode: lower id wins (PREC-5)',
    groups: ['sre', 'platform'],
    grants: [viaGroup('g2', 'sre', 100, 'readOnly'), viaGroup('g1', 'platform', 100, 'readOnly')],
    expected: { winner: 'g1', mode: 'readOnly', narrowed: false, losers: [['g2', 'tieBrokenById', 'platform']] },
  },
  {
    name: "the user's read-only flag narrows a read-write winner (PREC-6)",
    groups: ['sre'],
    isReadOnly: true,
    grants: [viaGroup('g1', 'sre', 100, 'readWrite')],
    expected: { winner: 'g1', mode: 'readOnly', narrowed: true, losers: [] },
  },
  {
    name: 'system:* memberships never match (GRP-3)',
    groups: ['system:authenticated'],
    grants: [viaGroup('g1', 'system:authenticated', 100, 'readWrite')],
  },
  {
    name: 'no direct grant and no group grant of a member group: no access',
    groups: ['auditors'],
    grants: [viaGroup('g1', 'sre', 100, 'readWrite')],
  },
];

describe('resolveAccess (PREC-3..6)', () => {
  it.each(cases)('$name', ({ groups, isReadOnly = false, grants, expected }) => {
    const bob = userNamed('bob');
    mockDb.grants.push(...grants);

    const access = resolveAccess({ ...bob, groups, isReadOnly }, 'prod-us-1');

    if (!expected) {
      expect(access).toBeUndefined();
      return;
    }
    expect(access?.winner.id).toBe(expected.winner);
    expect(access?.accessMode).toBe(expected.mode);
    expect(access?.narrowedByReadOnlyFlag).toBe(expected.narrowed);
    expect(access?.candidates[0]).toMatchObject({ outcome: 'winner', beatenBy: null });
    expect(access?.candidates.slice(1).map((c) => [c.grant.id, c.outcome, c.beatenBy])).toEqual(expected.losers);
  });

  it('gives a deactivated user nothing, even through groups (dave in sre)', () => {
    const dave = userNamed('dave');
    expect(resolveAccess(dave, 'dev-1')).toBeUndefined();
  });

  it('the switcher and Effective access agree (alice keeps her direct staging-eu-1 grant over sre)', async () => {
    setMockUser('alice');
    const switcher = await unwrap(apiClient.GET('/api/clusters'));
    setMockUser('admin');
    const effective = await unwrap(
      apiClient.GET('/api/admin/users/{username}/effective-access', { params: { path: { username: 'alice' } } }),
    );

    expect(switcher.map((c) => [c.name, c.accessMode])).toEqual(
      expect.arrayContaining(effective.clusters.map((c) => [c.clusterName, c.accessMode])),
    );
    expect(switcher).toHaveLength(effective.clusters.length);
    const staging = effective.clusters.find((c) => c.clusterName === 'staging-eu-1');
    expect(staging).toMatchObject({ accessMode: 'readWrite', source: { kind: 'user' } });
    expect(staging?.candidates.map((c) => [c.subjectName, c.outcome])).toEqual([
      ['alice', 'winner'],
      ['sre', 'overriddenByDirectGrant'],
    ]);
    expect(effective.groups).toEqual(['sre']);
  });
});
