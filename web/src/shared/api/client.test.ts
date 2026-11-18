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
});
