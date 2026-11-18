import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { apiClient, CSRF_HEADER, withCsrfHeader } from './client';

describe('withCsrfHeader', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('adds %s requests the CSRF header', (method) => {
    const request = withCsrfHeader(new Request('http://localhost/api/x', { method }));
    expect(request.headers.get(CSRF_HEADER)).toBe('1');
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('leaves safe %s requests untouched', (method) => {
    const request = withCsrfHeader(new Request('http://localhost/api/x', { method }));
    expect(request.headers.has(CSRF_HEADER)).toBe(false);
  });
});

describe('apiClient', () => {
  it('calls same-origin /api paths without the CSRF header on GET', async () => {
    let seen: Request | undefined;
    server.use(
      http.get('*/api/system/info', ({ request }) => {
        seen = request;
        return HttpResponse.json({ version: '1', environment: 'x' });
      }),
    );

    const { data } = await apiClient.GET('/api/system/info');

    expect(data).toEqual({ version: '1', environment: 'x' });
    expect(seen && new URL(seen.url).pathname).toBe('/api/system/info');
    expect(seen?.headers.has(CSRF_HEADER)).toBe(false);
  });

  // The generated schema has no mutating operation yet (CP0), so the typed methods are called through an untyped
  // view. This proves the middleware is registered on the shared client itself, not only that the helper works.
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'sends the CSRF header on %s requests through the shared client',
    async (method) => {
      let seen: Request | undefined;
      server.use(
        http.all('*/api/qa-probe', ({ request }) => {
          seen = request;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      const call = apiClient[method] as unknown as (path: string) => Promise<{ response: Response }>;

      const { response } = await call('/api/qa-probe');

      expect(response.status).toBe(204);
      expect(seen?.method).toBe(method);
      expect(seen?.headers.get(CSRF_HEADER)).toBe('1');
    },
  );

  it('sends requests same-origin (session cookie only goes to the console itself)', async () => {
    let seen: Request | undefined;
    server.use(
      http.get('*/api/system/info', ({ request }) => {
        seen = request;
        return HttpResponse.json({ version: '1', environment: 'x' });
      }),
    );

    await apiClient.GET('/api/system/info');

    expect(seen && new URL(seen.url).origin).toBe(globalThis.location.origin);
  });
});
