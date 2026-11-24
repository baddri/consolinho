import { apiClient, unwrap } from '@/shared/api';
import { expectApiError } from '@/test/apiError';
import { CSRF_HEADER } from '@/shared/api';
import { credentialIds, grantIds, mockDb, setMockHostGroups } from '@/test/handlers';

type Mode = 'readOnly' | 'readWrite';

const createGroupGrant = (
  groupName: string,
  body: { clusterName: string; credentialId: string; accessMode?: Mode; priority: number },
) =>
  unwrap(
    apiClient.POST('/api/admin/groups/{groupName}/grants', {
      params: { path: { groupName } },
      body: { accessMode: 'readOnly', ...body },
    }),
  );

const bulk = (groupName: string, priority: number, items: { clusterName: string; credentialId: string }[]) =>
  unwrap(
    apiClient.POST('/api/admin/groups/{groupName}/grants/bulk', {
      params: { path: { groupName } },
      body: { accessMode: 'readOnly', priority, items },
    }),
  );

const prodEu = { clusterName: 'prod-eu-1', credentialId: credentialIds.prodEuView };
const staging = { clusterName: 'staging-eu-1', credentialId: credentialIds.stagingAdmin };

describe('mock group grants API (contract CP4.5a §3)', () => {
  it('refuses system:* groups (GRP-3)', async () => {
    const error = await expectApiError(createGroupGrant('system:authenticated', { ...prodEu, priority: 10 }));
    expect(error.fieldErrors).toEqual({ groupName: ["System groups can't be granted access."] });
  });

  it.each(['a/b', ' sre', 'a:b', 'x%y'])('refuses the invalid name %j (GRP-6)', async (name) => {
    const error = await expectApiError(createGroupGrant(name, { ...prodEu, priority: 10 }));
    expect(error.fieldErrors).toEqual({ groupName: ['Enter a valid group name.'] });
  });

  it.each([0, 1001])('requires a priority between 1 and 1000 (GRP-2): %j', async (priority) => {
    const error = await expectApiError(createGroupGrant('sre', { ...prodEu, priority }));
    expect([error.status, error.code]).toEqual([400, 'Validation.Failed']);
    expect(error.fieldErrors).toEqual({ priority: ['Priority must be between 1 and 1000.'] });
  });

  it('requires a priority (GRP-2): missing', async () => {
    const response = await fetch(new URL('/api/admin/groups/sre/grants', globalThis.location.origin), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: '1' },
      body: JSON.stringify(prodEu),
    });
    const body = (await response.json()) as { errors: Record<string, string[]> };

    expect(response.status).toBe(400);
    expect(body.errors).toEqual({ priority: ['Priority must be between 1 and 1000.'] });
  });

  it('refuses a priority another group holds on the cluster, naming it (GRP-4)', async () => {
    const error = await expectApiError(
      createGroupGrant('auditors', { ...staging, priority: 100 }),
    );
    expect([error.status, error.code]).toEqual([409, 'Grants.PriorityTaken']);
    expect(error.detail).toBe('Priority 100 is already used by group `sre` on this cluster.');
  });

  it('refuses a second grant of the group on the cluster (GRP-5)', async () => {
    const error = await expectApiError(
      createGroupGrant('sre', { ...staging, priority: 300 }),
    );
    expect([error.status, error.code]).toEqual([409, 'Grants.AlreadyExists']);
    expect(error.detail).toBe('Group "sre" already has access to "staging-eu-1".');
  });

  it('creates a group grant that the group lists and audits', async () => {
    const grant = await createGroupGrant('auditors', { ...prodEu, priority: 300 });

    expect(grant).toMatchObject({
      subjectKind: 'group',
      subjectName: 'auditors',
      priority: 300,
      username: null,
      userStatus: null,
    });
    const listed = await unwrap(
      apiClient.GET('/api/admin/groups/{groupName}/grants', { params: { path: { groupName: 'auditors' } } }),
    );
    expect(listed.map((g) => g.id)).toEqual([grant.id]);
    expect(mockDb.audit[0]).toMatchObject({ action: 'grant.created', targetName: 'group auditors → prod-eu-1' });
  });

  it('bulk is all-or-nothing with per-item errors (GPG-3)', async () => {
    const before = mockDb.grants.length;

    const error = await expectApiError(
      bulk('sre', 50, [
        { clusterName: 'dev-1', credentialId: credentialIds.dev1Edit }, // valid on its own
        staging, // already granted, and priority 50 is held by ghost-team
        { clusterName: 'nowhere-1', credentialId: credentialIds.dev1Edit },
      ]),
    );

    expect([error.status, error.code]).toEqual([400, 'Validation.Failed']);
    expect(error.fieldErrors).toEqual({
      'items[1].clusterName': [
        'Group "sre" already has access to "staging-eu-1".',
        'Priority 50 is already used by group `ghost-team` on this cluster.',
      ],
      'items[2].clusterName': ["Cluster nowhere-1 doesn't exist."],
    });
    expect(mockDb.grants).toHaveLength(before);
  });

  it('bulk creates every grant with the shared mode and priority', async () => {
    const created = await bulk('auditors', 7, [
      prodEu,
      { clusterName: 'dev-1', credentialId: credentialIds.dev1Edit },
    ]);
    expect(created.map((g) => [g.clusterName, g.priority, g.accessMode])).toEqual([
      ['prod-eu-1', 7, 'readOnly'],
      ['dev-1', 7, 'readOnly'],
    ]);
  });

  it('PUT enforces the priority rules by grant kind', async () => {
    const update = (id: string, credentialId: string, priority: number | null) =>
      unwrap(
        apiClient.PUT('/api/admin/grants/{grantId}', {
          params: { path: { grantId: id } },
          body: { accessMode: 'readOnly', credentialId, version: 1, priority },
        }),
      );

    const ghost = grantIds.ghostTeamStaging;
    const taken = await expectApiError(update(ghost, credentialIds.stagingAdmin, 100));
    const missing = await expectApiError(update(ghost, credentialIds.stagingAdmin, null));
    const onUser = await expectApiError(update(grantIds.adminDev1, credentialIds.dev1Edit, 5));
    const moved = await update(ghost, credentialIds.stagingAdmin, 60);

    expect([taken.status, taken.code, taken.detail]).toEqual([
      409,
      'Grants.PriorityTaken',
      'Priority 100 is already used by group `sre` on this cluster.',
    ]);
    expect(missing.fieldErrors).toEqual({ priority: ['Priority must be between 1 and 1000.'] });
    expect(onUser.fieldErrors).toEqual({ priority: ['Priority applies to group grants only.'] });
    expect([moved.priority, moved.version]).toEqual([60, 2]);
  });
});

describe('mock groups API (contract CP4.5a §4)', () => {
  it('lists host groups and grant-only groups, without system:* groups', async () => {
    const list = await unwrap(apiClient.GET('/api/admin/groups'));

    expect(list.hostStatus).toBe('ok');
    expect(list.items.map((g) => [g.name, g.foundOnHost, g.memberCount, g.clusterCount])).toEqual([
      ['auditors', true, 1, 0],
      ['ghost-team', false, null, 1],
      ['platform', true, 1, 0],
      ['sre', true, 3, 1],
    ]);
  });

  it('keeps the grant-only groups when the host listing is forbidden', async () => {
    setMockHostGroups('forbidden');

    const list = await unwrap(apiClient.GET('/api/admin/groups'));

    expect([list.hostStatus, list.hostReadAt]).toEqual(['forbidden', null]);
    expect(list.items).toEqual([
      { name: 'ghost-team', foundOnHost: null, memberCount: null, clusterCount: 1 },
      { name: 'sre', foundOnHost: null, memberCount: null, clusterCount: 1 },
    ]);
  });

  it('shows a group with its members, registered or not', async () => {
    const group = await unwrap(
      apiClient.GET('/api/admin/groups/{groupName}', { params: { path: { groupName: 'sre' } } }),
    );
    expect(group.members?.map((m) => [m.username, m.isRegistered])).toEqual([
      ['alice', true],
      ['bob', true],
      ['zoe', false],
    ]);
  });

  it('answers 404 Groups.NotFound for unknown and system groups', async () => {
    const get = (groupName: string) =>
      expectApiError(unwrap(apiClient.GET('/api/admin/groups/{groupName}', { params: { path: { groupName } } })));

    const unknown = await get('nobody');
    const system = await get('system:authenticated');

    expect([unknown.status, unknown.code, unknown.detail]).toEqual([404, 'Groups.NotFound', "Group nobody doesn't exist."]);
    expect(system.code).toBe('Groups.NotFound');
  });
});
