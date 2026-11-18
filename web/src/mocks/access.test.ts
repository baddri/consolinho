import { apiClient, CSRF_HEADER, unwrap, unwrapNoContent } from '@/shared/api';
import { expectApiError } from '@/test/apiError';
import { setMockUser } from '@/test/handlers';

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
    expect(error.detail).toBe("You don't have access to Administration.");
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
          body: { token: 'abc', credentialId: null, inspectNamespace: null },
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
    await expect(fetch(url('/api/clusters/prod-eu-1/k8s/api/v1/pods'))).rejects.toThrow();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('No mock handler for GET /api/admin/not-a-route'),
    );
  });
});
