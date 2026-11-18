import { apiClient, unwrap } from '@/shared/api';
import { expectApiError } from '@/test/apiError';
import { mockDb, setMockUser } from '@/test/handlers';

const getUser = (username: string) =>
  unwrap(apiClient.GET('/api/admin/users/{username}', { params: { path: { username } } }));

const changeRole = (username: string, role: 'admin' | 'user', version: number) =>
  unwrap(
    apiClient.PUT('/api/admin/users/{username}/role', {
      params: { path: { username } },
      body: { role, version },
    }),
  );

describe('mock users API (contract §7.2)', () => {
  it('lists every persona sorted by username with derived role and grant count', async () => {
    const users = await unwrap(apiClient.GET('/api/admin/users'));

    expect(users.map((u) => u.username)).toEqual([
      'admin',
      'alice',
      'bob',
      'carol',
      'dave',
      'ines',
      'pending-paul',
    ]);
    expect(users.find((u) => u.username === 'admin')).toMatchObject({
      role: 'admin',
      isAdminViaConfiguration: true,
      isAdminByAssignment: false,
      adminConfigurationSource: 'group fleetconsole-admins',
      grantCount: 1,
    });
    expect(users.find((u) => u.username === 'alice')).toMatchObject({ role: 'user', grantCount: 2 });
  });

  it('rejects a stale version with 409 Concurrency.Conflict and changes nothing', async () => {
    const carol = await getUser('carol');

    const error = await expectApiError(changeRole('carol', 'user', carol.version - 1));

    expect([error.status, error.code]).toEqual([409, 'Concurrency.Conflict']);
    expect(error.detail).toBe('This user was changed by someone else. Reload and try again.');
    expect(mockDb.users.find((u) => u.username === 'carol')?.isAdminByAssignment).toBe(true);
  });

  it('promote records the assignment for a config admin and bumps the version (ADR-0017)', async () => {
    setMockUser('carol');
    const admin = await getUser('admin');

    const promoted = await changeRole('admin', 'admin', admin.version);
    const again = await changeRole('admin', 'admin', promoted.version);

    expect(promoted).toMatchObject({ role: 'admin', isAdminByAssignment: true, version: admin.version + 1 });
    expect(again.version).toBe(promoted.version); // no-op once assigned
    expect(mockDb.audit[0]).toMatchObject({
      action: 'user.promoted',
      actor: 'carol',
      details: { source: 'manual', configurationSource: 'group fleetconsole-admins' },
    });
  });

  it('refuses to demote an admin via configuration (409 Users.AdminViaConfiguration)', async () => {
    setMockUser('carol');
    const admin = await getUser('admin');

    const error = await expectApiError(changeRole('admin', 'user', admin.version));

    expect(error.code).toBe('Users.AdminViaConfiguration');
    expect(error.detail).toContain('group fleetconsole-admins');
  });

  it('refuses self-demotion (Users.SelfChange) and making the last writable admin read-only (Users.LastAdmin)', async () => {
    const setReadOnly = (username: string, version: number) =>
      unwrap(
        apiClient.PUT('/api/admin/users/{username}/read-only', {
          params: { path: { username } },
          body: { isReadOnly: true, version },
        }),
      );
    setMockUser('carol');

    const self = await expectApiError(changeRole('carol', 'user', (await getUser('carol')).version));
    await setReadOnly('admin', (await getUser('admin')).version);
    const last = await expectApiError(setReadOnly('carol', (await getUser('carol')).version));

    expect(self.code).toBe('Users.SelfChange');
    expect(last.code).toBe('Users.LastAdmin');
    expect(last.detail).toBe(
      'carol is the last active administrator who can make changes. Promote another user first.',
    );
  });

  it('counts pending admins as writable admins for Users.LastAdmin (ADM-5)', async () => {
    const setReadOnly = (username: string, version: number) =>
      unwrap(
        apiClient.PUT('/api/admin/users/{username}/read-only', {
          params: { path: { username } },
          body: { isReadOnly: true, version },
        }),
      );
    setMockUser('carol');
    await setReadOnly('admin', (await getUser('admin')).version);
    await unwrap(apiClient.POST('/api/admin/users', { body: { username: 'new-admin', role: 'admin' } }));

    const carol = await setReadOnly('carol', (await getUser('carol')).version);

    expect(carol.isReadOnly).toBe(true); // the pending new-admin is still a writable admin
  });

  it('creates a pending user (201 + Location) and maps validation and duplicates', async () => {
    const { data, response } = await apiClient.POST('/api/admin/users', {
      body: { username: 'erin', role: 'admin' },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe('/api/admin/users/erin');
    expect(data).toMatchObject({ username: 'erin', status: 'pending', role: 'admin', createdBy: 'admin' });

    const taken = await expectApiError(
      unwrap(apiClient.POST('/api/admin/users', { body: { username: 'alice' } })),
    );
    expect([taken.status, taken.code]).toEqual([409, 'Users.UsernameTaken']);

    const invalid = await expectApiError(
      unwrap(apiClient.POST('/api/admin/users', { body: { username: 'a b/c' } })),
    );
    expect([invalid.status, invalid.code]).toEqual([400, 'Validation.Failed']);
    expect(invalid.fieldErrors).toEqual({ username: ["Username can't contain '/', '%' or whitespace."] });
  });

  it('answers 404 Users.NotFound for an unknown username', async () => {
    const error = await expectApiError(getUser('no body'));
    expect([error.status, error.code]).toEqual([404, 'Users.NotFound']);
    expect(error.detail).toBe("User no body doesn't exist."); // path params arrive URL-decoded
  });

  it('deactivate ends the user and reactivate restores active/pending', async () => {
    const bob = await getUser('bob');
    const deactivated = await unwrap(
      apiClient.POST('/api/admin/users/{username}/deactivate', {
        params: { path: { username: 'bob' } },
        body: { version: bob.version },
      }),
    );
    const reactivated = await unwrap(
      apiClient.POST('/api/admin/users/{username}/reactivate', {
        params: { path: { username: 'bob' } },
        body: { version: deactivated.version },
      }),
    );

    expect(deactivated.status).toBe('deactivated');
    expect(reactivated).toMatchObject({ status: 'active', version: bob.version + 2 });
  });
});
