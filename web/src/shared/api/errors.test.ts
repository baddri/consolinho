import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { apiClient } from './client';
import { ApiError, errorMessage, isApiError, unwrap, unwrapNoContent } from './errors';

const problemJson = { 'Content-Type': 'application/problem+json' };

/** Runs `promise`, expecting it to reject with an ApiError, and returns that error. */
async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('unwrap', () => {
  it('returns the body of a 2xx response', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          username: 'alice',
          displayName: 'Alice Example',
          role: 'user',
          isReadOnly: false,
          groups: ['sre'],
          isAdminViaConfiguration: false,
          adminConfigurationSource: null,
        }),
      ),
    );

    const me = await unwrap(apiClient.GET('/api/auth/me'));

    expectTypeOf(me.username).toEqualTypeOf<string>();
    expect(me.username).toBe('alice');
  });

  it('maps a 400 with field errors, keeping keys as sent (incl. "" and indexed paths)', async () => {
    server.use(
      http.post('*/api/admin/users/:username/grants/bulk', () =>
        HttpResponse.json(
          {
            type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
            title: 'One or more validation errors occurred.',
            status: 400,
            code: 'Validation.Failed',
            traceId: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
            errors: {
              '': ['Cluster listed twice.'],
              'items[1].credentialId': ['This credential belongs to another cluster.'],
            },
          },
          { status: 400, headers: problemJson },
        ),
      ),
    );

    const error = await rejection(
      unwrap(
        apiClient.POST('/api/admin/users/{username}/grants/bulk', {
          params: { path: { username: 'alice' } },
          body: { accessMode: 'readOnly', items: [] },
        }),
      ),
    );

    expect(error.status).toBe(400);
    expect(error.code).toBe('Validation.Failed');
    expect(error.title).toBe('One or more validation errors occurred.');
    expect(error.detail).toBeUndefined();
    expect(error.traceId).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    expect(error.fieldErrors).toEqual({
      '': ['Cluster listed twice.'],
      'items[1].credentialId': ['This credential belongs to another cluster.'],
    });
  });

  it('maps a 409 with a contract code and shows its detail verbatim', async () => {
    const detail = 'This user was changed by someone else. Reload and try again.';
    server.use(
      http.put('*/api/admin/users/:username/role', () =>
        HttpResponse.json(
          { title: 'Conflict', status: 409, code: 'Concurrency.Conflict', detail },
          { status: 409, headers: problemJson },
        ),
      ),
    );

    const error = await rejection(
      unwrap(
        apiClient.PUT('/api/admin/users/{username}/role', {
          params: { path: { username: 'alice' } },
          body: { role: 'admin', version: 3 },
        }),
      ),
    );

    expect(error.status).toBe(409);
    expect(isApiError(error, 'Concurrency.Conflict')).toBe(true);
    expect(isApiError(error, 'Users.LastAdmin')).toBe(false);
    expect(error.fieldErrors).toEqual({});
    expect(errorMessage(error)).toBe(detail);
  });

  it('maps a 401 so the QueryClient can recognise it', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(
          {
            title: 'Unauthorized',
            status: 401,
            code: 'Auth.Unauthenticated',
            detail: 'Authentication required.',
          },
          { status: 401, headers: problemJson },
        ),
      ),
    );

    const error = await rejection(unwrap(apiClient.GET('/api/auth/me')));

    expect(error.status).toBe(401);
    expect(error.code).toBe('Auth.Unauthenticated');
    expect(error.message).toBe('HTTP 401: Authentication required.');
  });

  it('maps a non-JSON 502 (e.g. from a router) without a code', async () => {
    server.use(
      http.get(
        '*/api/admin/users',
        () =>
          new HttpResponse('<html>Bad Gateway</html>', {
            status: 502,
            statusText: 'Bad Gateway',
            headers: { 'Content-Type': 'text/html' },
          }),
      ),
    );

    const error = await rejection(unwrap(apiClient.GET('/api/admin/users')));

    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
    expect(error.title).toBe('Bad Gateway');
    expect(error.detail).toBeUndefined();
    expect(error.fieldErrors).toEqual({});
    expect(errorMessage(error)).toBe('Bad Gateway');
  });

  it('ignores malformed ProblemDetails fields instead of failing', async () => {
    server.use(
      http.get('*/api/admin/users', () =>
        HttpResponse.json(
          { title: 42, detail: 'Still readable.', code: null, errors: 'nope' },
          { status: 500, headers: problemJson },
        ),
      ),
    );

    const error = await rejection(unwrap(apiClient.GET('/api/admin/users')));

    expect(error.status).toBe(500);
    expect(error.detail).toBe('Still readable.');
    expect(error.code).toBeUndefined();
    expect(error.fieldErrors).toEqual({});
  });

  it('maps a network failure to status 0 with a fixed detail', async () => {
    server.use(http.get('*/api/admin/users', () => HttpResponse.error()));

    const error = await rejection(unwrap(apiClient.GET('/api/admin/users')));

    expect(error.status).toBe(0);
    expect(error.code).toBeUndefined();
    expect(error.detail).toBe('The Consolinho API could not be reached.');
    expect(errorMessage(error)).toBe('The Consolinho API could not be reached.');
  });

  it('rethrows cancellations unchanged', async () => {
    const controller = new AbortController();
    controller.abort();

    const reason: unknown = await unwrap(
      apiClient.GET('/api/admin/users', { signal: controller.signal }),
    ).catch((error: unknown) => error);

    expect(reason).not.toBeInstanceOf(ApiError);
    expect(reason).toHaveProperty('name', 'AbortError');
  });

  it('treats a 2xx without a body as an error (use unwrapNoContent for 204 endpoints)', async () => {
    server.use(http.get('*/api/admin/users', () => new HttpResponse(null, { status: 204 })));

    const error = await rejection(unwrap(apiClient.GET('/api/admin/users')));

    expect(error.status).toBe(204);
  });
});

describe('unwrapNoContent', () => {
  it('resolves on 204', async () => {
    let called = false;
    server.use(
      http.delete('*/api/admin/grants/:grantId', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(
      unwrapNoContent(
        apiClient.DELETE('/api/admin/grants/{grantId}', {
          params: { path: { grantId: '3f6c1e1a-5b7d-4f43-9a51-2c0d8f1e7a90' } },
        }),
      ),
    ).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it('throws an ApiError on failure', async () => {
    server.use(
      http.delete('*/api/admin/clusters/:name', () =>
        HttpResponse.json(
          {
            title: 'Conflict',
            status: 409,
            code: 'Clusters.NotDisabled',
            detail: 'Disable prod-eu-1 before deleting it.',
          },
          { status: 409, headers: problemJson },
        ),
      ),
    );

    const error = await rejection(
      unwrapNoContent(
        apiClient.DELETE('/api/admin/clusters/{name}', { params: { path: { name: 'prod-eu-1' } } }),
      ),
    );

    expect(error.code).toBe('Clusters.NotDisabled');
    expect(errorMessage(error)).toBe('Disable prod-eu-1 before deleting it.');
  });

  it('maps a network failure to status 0', async () => {
    server.use(http.post('*/api/auth/logout', () => HttpResponse.error()));

    const error = await rejection(unwrapNoContent(apiClient.POST('/api/auth/logout')));

    expect(error.status).toBe(0);
  });
});

describe('errorMessage', () => {
  it('prefers detail, then title', () => {
    expect(errorMessage(new ApiError({ status: 409, title: 'Conflict', detail: 'Exact text.' }))).toBe(
      'Exact text.',
    );
    expect(errorMessage(new ApiError({ status: 500, title: 'Internal Server Error' }))).toBe(
      'Internal Server Error',
    );
  });

  it('never exposes the message of a non-API error', () => {
    expect(errorMessage(new Error('TypeError: x is undefined'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(errorMessage('boom')).toBe('Something went wrong. Please try again.');
  });
});
