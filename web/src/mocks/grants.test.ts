import { apiClient, unwrap } from '@/shared/api';
import { expectApiError } from '@/test/apiError';
import { credentialIds, grantIds, mockDb, setMockUser } from '@/test/handlers';

const bulk = (username: string, items: { clusterName: string; credentialId: string }[]) =>
  unwrap(
    apiClient.POST('/api/admin/users/{username}/grants/bulk', {
      params: { path: { username } },
      body: { accessMode: 'readOnly', items },
    }),
  );

describe('mock grants API (contract §9)', () => {
  it('bulk is all-or-nothing and reports item errors keyed items[i].…', async () => {
    const before = mockDb.grants.length;

    const error = await expectApiError(
      bulk('bob', [
        { clusterName: 'prod-eu-1', credentialId: credentialIds.prodEuView }, // valid on its own
        { clusterName: 'nowhere-1', credentialId: credentialIds.prodEuView },
        { clusterName: 'dev-1', credentialId: credentialIds.prodEuView },
        { clusterName: 'prod-eu-1', credentialId: credentialIds.prodEuEdit },
      ]),
    );

    expect([error.status, error.code]).toEqual([400, 'Validation.Failed']);
    expect(error.fieldErrors).toEqual({
      'items[1].clusterName': ["Cluster nowhere-1 doesn't exist."],
      'items[2].credentialId': ['This credential belongs to another cluster.'],
      'items[3].clusterName': ['Cluster listed twice.'],
    });
    expect(mockDb.grants).toHaveLength(before);
  });

  it('bulk flags clusters the user already has access to', async () => {
    const error = await expectApiError(
      bulk('alice', [{ clusterName: 'prod-eu-1', credentialId: credentialIds.prodEuView }]),
    );
    expect(error.fieldErrors).toEqual({ 'items[0].clusterName': ['alice already has access to prod-eu-1.'] });
  });

  it('bulk creates every grant in request order and the derived lists follow', async () => {
    const created = await bulk('bob', [
      { clusterName: 'prod-us-1', credentialId: credentialIds.prodUsLegacy },
      { clusterName: 'dev-2', credentialId: credentialIds.dev2View },
    ]);

    expect(created.map((g) => [g.clusterName, g.accessMode, g.clusterIsEnabled])).toEqual([
      ['prod-us-1', 'readOnly', true],
      ['dev-2', 'readOnly', false],
    ]);
    const bob = await unwrap(
      apiClient.GET('/api/admin/users/{username}', { params: { path: { username: 'bob' } } }),
    );
    expect(bob.grantCount).toBe(2);
    setMockUser('bob');
    // Disabled dev-2 is not switchable (SW-1).
    expect((await unwrap(apiClient.GET('/api/clusters'))).map((c) => c.name)).toEqual(['prod-us-1']);
  });

  it('single create rejects a second grant for the same user and cluster (409 Grants.AlreadyExists)', async () => {
    const error = await expectApiError(
      unwrap(
        apiClient.POST('/api/admin/grants', {
          body: { username: 'alice', clusterName: 'prod-eu-1', credentialId: credentialIds.prodEuEdit },
        }),
      ),
    );
    expect([error.status, error.code]).toEqual([409, 'Grants.AlreadyExists']);
  });

  it('update checks the version and returns the fresh representation', async () => {
    const path = { params: { path: { grantId: grantIds.aliceProdEu } } };

    const stale = await expectApiError(
      unwrap(
        apiClient.PUT('/api/admin/grants/{grantId}', {
          ...path,
          body: { accessMode: 'readWrite', credentialId: credentialIds.prodEuEdit, version: 0 },
        }),
      ),
    );
    const updated = await unwrap(
      apiClient.PUT('/api/admin/grants/{grantId}', {
        ...path,
        body: { accessMode: 'readWrite', credentialId: credentialIds.prodEuEdit, version: 1 },
      }),
    );

    expect(stale.code).toBe('Concurrency.Conflict');
    expect(updated).toMatchObject({
      accessMode: 'readWrite',
      credentialName: 'fleet-edit',
      version: 2,
      updatedBy: 'admin',
    });
  });

  it('exposes the GRANT-5 marker fields', async () => {
    const grants = await unwrap(
      apiClient.GET('/api/admin/users/{username}/grants', { params: { path: { username: 'ines' } } }),
    );
    const daveGrants = await unwrap(
      apiClient.GET('/api/admin/clusters/{name}/grants', { params: { path: { name: 'dev-1' } } }),
    );

    expect(grants[0]).toMatchObject({ clusterName: 'prod-us-1', credentialExpiryStatus: 'expired' });
    expect(daveGrants.map((g) => [g.username, g.userStatus])).toEqual([
      ['admin', 'active'],
      ['dave', 'deactivated'],
    ]);
  });
});

describe('mock cluster switcher (contract §6)', () => {
  it('lists enabled granted clusters with the effective access mode, sorted by environment then name', async () => {
    setMockUser('alice');
    expect(await unwrap(apiClient.GET('/api/clusters'))).toEqual([
      expect.objectContaining({ name: 'prod-eu-1', environment: 'production', accessMode: 'readOnly' }),
      expect.objectContaining({ name: 'prod-k8s-1', environment: 'production', accessMode: 'readOnly' }),
      expect.objectContaining({ name: 'staging-eu-1', environment: 'staging', accessMode: 'readWrite' }),
      expect.objectContaining({ name: 'lab-1', environment: 'development', accessMode: 'readOnly' }),
    ]);
  });

  it('gives admins only their own grants (GRANT-6) and bob none (SW-4)', async () => {
    expect((await unwrap(apiClient.GET('/api/clusters'))).map((c) => c.name)).toEqual(['prod-k8s-1', 'dev-1', 'lab-1']);
    setMockUser('bob');
    expect(await unwrap(apiClient.GET('/api/clusters'))).toEqual([]);
  });
});
