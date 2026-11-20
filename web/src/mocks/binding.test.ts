import { CSRF_HEADER } from '@/shared/api';
import { credentialIds, grantIds, setMockUser } from '@/test/handlers';

/**
 * Sends a raw JSON body (bypassing the typed client, which can't express wrong types) with the CSRF header and
 * returns status and ProblemDetails body.
 */
async function send(method: string, path: string, body: unknown) {
  const response = await fetch(new URL(path, globalThis.location.origin), {
    method,
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: '1' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as { code?: string; errors?: Record<string, string[]> },
  };
}

describe('mock request binding vs validation (contract §1)', () => {
  it.each([
    ['malformed JSON', 'PUT', '/api/admin/users/carol/role', '{"role":'],
    ['a quoted version', 'PUT', '/api/admin/users/carol/role', { role: 'user', version: '4' }],
    ['an unknown enum value', 'PUT', '/api/admin/users/carol/role', { role: 'superuser', version: 4 }],
    ['a number where a string is expected', 'POST', '/api/admin/users', { username: 42 }],
    ['null for a boolean', 'PUT', '/api/admin/users/carol/read-only', { isReadOnly: null, version: 4 }],
    [
      'an unknown accessMode',
      'PUT',
      `/api/admin/grants/${grantIds.aliceProdEu}`,
      { accessMode: 'admin', credentialId: credentialIds.prodEuView, version: 1 },
    ],
    [
      'a non-object bulk item',
      'POST',
      '/api/admin/users/bob/grants/bulk',
      { accessMode: 'readOnly', items: ['dev-1'] },
    ],
    [
      'items that is not an array',
      'POST',
      '/api/admin/users/bob/grants/bulk',
      { accessMode: 'readOnly', items: {} },
    ],
  ])('answers %s with a framework 400 without code', async (_case, method, path, body) => {
    const { status, body: problem } = await send(method, path, body);

    expect(status).toBe(400);
    expect(problem.code).toBeUndefined();
    expect(problem.errors).toBeUndefined();
  });

  it('keeps Validation.Failed for absent and blank required values', async () => {
    const missing = await send('PUT', '/api/admin/users/carol/role', { version: 4 });
    const blank = await send('POST', '/api/admin/users', { username: '  ' });

    expect(missing.body).toMatchObject({
      code: 'Validation.Failed',
      errors: { role: ['Role is required.'] },
    });
    expect(blank.body).toMatchObject({
      code: 'Validation.Failed',
      errors: { username: ['Username is required.'] },
    });
  });

  it('reports body validation before the route 404 (bulk, test-token)', async () => {
    const bulk = await send('POST', '/api/admin/users/nobody/grants/bulk', {
      accessMode: 'readOnly',
      items: [],
    });
    const testToken = await send('POST', '/api/admin/clusters/nowhere/test-token', { token: 'a b' });

    expect(bulk.body.errors).toEqual({ items: ['Select between 1 and 100 clusters.'] });
    expect(testToken.body.errors).toEqual({ token: ['The token must not contain spaces or line breaks.'] });
  });

  it('answers a read-only admin with Auth.ReadOnly, never field errors (contract §7 check order)', async () => {
    setMockUser('ines');

    const { status, body } = await send('POST', '/api/admin/users', { username: 'has space' });

    expect(status).toBe(403);
    expect(body.code).toBe('Auth.ReadOnly');
    expect(body.errors).toBeUndefined();
  });
});
