import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { apiClient } from './client';
import type * as Contract from './schema.contract';
import type * as Gen from './schema.gen';
import type { paths, schemas } from './schema';
import type { AuditEntry, Credential, UserListItem } from './types';

const CREDENTIAL_ID = '3f6c1e1a-5b7d-4f43-9a51-2c0d8f1e7a90';
const GRANT_ID = '9b2d4c7e-1a3f-4e5b-8c6d-0f1e2a3b4c5d';

describe('merged API types (ADR-0016)', () => {
  it('takes generated paths when they exist and contract paths otherwise', () => {
    expectTypeOf<paths['/api/system/info']>().toEqualTypeOf<Gen.paths['/api/system/info']>();
    expectTypeOf<paths['/api/auth/me']>().toEqualTypeOf<Gen.paths['/api/auth/me']>();
    expectTypeOf<paths['/api/clusters']>().toEqualTypeOf<Gen.paths['/api/clusters']>();
    // Contract-only until T-0020 (connection tests) lands; then T-0043 retires this contract fallback check.
    expectTypeOf<paths['/api/admin/clusters/{name}/test-token']>().toEqualTypeOf<
      Contract.paths['/api/admin/clusters/{name}/test-token']
    >();
  });

  it('takes generated schemas when they exist and contract schemas otherwise', () => {
    expectTypeOf<schemas['SystemInfo']>().toEqualTypeOf<Gen.components['schemas']['SystemInfo']>();
    expectTypeOf<schemas['ProblemDetails']>().toEqualTypeOf<Gen.components['schemas']['ProblemDetails']>();
    expectTypeOf<schemas['UserDetail']>().toEqualTypeOf<Contract.components['schemas']['UserDetail']>();
  });

  it('carries the orchestrator contract amendments', () => {
    expectTypeOf<UserListItem['version']>().toEqualTypeOf<number>();
    expectTypeOf<UserListItem['adminConfigurationSource']>().toEqualTypeOf<string | null>();
    expectTypeOf<UserListItem['isAdminByAssignment']>().toEqualTypeOf<boolean>();
    expectTypeOf<schemas['ClusterListItem']['version']>().toEqualTypeOf<number>();
    expectTypeOf<Credential['expiryWarningDays']>().toEqualTypeOf<number>();
    expectTypeOf<Contract.components['schemas']['ProblemDetails']['code']>().toEqualTypeOf<
      string | null | undefined
    >();
    expectTypeOf<AuditEntry['details']>().toBeUnknown();
  });
});

describe('apiClient covers every CP1 contract route', () => {
  it('builds method and URL for each route (path params encoded)', async () => {
    const seen: string[] = [];
    server.use(
      http.all('*/api/*', ({ request }) => {
        const url = new URL(request.url);
        seen.push(`${request.method} ${url.pathname}${url.search}`);
        return HttpResponse.json({});
      }),
    );
    const user = { params: { path: { username: 'alice smith' } } };
    const cluster = { params: { path: { name: 'prod-eu-1' } } };
    const credential = { params: { path: { name: 'prod-eu-1', credentialId: CREDENTIAL_ID } } };
    const grant = { params: { path: { grantId: GRANT_ID } } };

    await Promise.all([
      apiClient.POST('/api/auth/logout'),
      apiClient.GET('/api/auth/me'),
      apiClient.GET('/api/clusters'),
      apiClient.GET('/api/admin/users'),
      apiClient.POST('/api/admin/users', { body: { username: 'bob' } }),
      apiClient.GET('/api/admin/users/{username}', user),
      apiClient.PUT('/api/admin/users/{username}/role', { ...user, body: { role: 'admin', version: 1 } }),
      apiClient.PUT('/api/admin/users/{username}/read-only', {
        ...user,
        body: { isReadOnly: true, version: 1 },
      }),
      apiClient.POST('/api/admin/users/{username}/deactivate', { ...user, body: { version: 1 } }),
      apiClient.POST('/api/admin/users/{username}/reactivate', { ...user, body: { version: 1 } }),
      apiClient.GET('/api/admin/users/{username}/grants', user),
      apiClient.POST('/api/admin/users/{username}/grants/bulk', {
        ...user,
        body: { accessMode: 'readOnly', items: [{ clusterName: 'prod-eu-1', credentialId: CREDENTIAL_ID }] },
      }),
      apiClient.GET('/api/admin/clusters'),
      apiClient.POST('/api/admin/clusters', {
        body: {
          name: 'dev-1',
          displayName: null,
          apiUrl: 'https://api.dev-1.example.com:6443',
          environment: 'development',
          webConsoleUrl: null,
          description: null,
          caBundle: null,
          skipTlsVerify: false,
        },
      }),
      apiClient.GET('/api/admin/clusters/{name}', cluster),
      apiClient.PUT('/api/admin/clusters/{name}', {
        ...cluster,
        body: {
          displayName: 'Prod EU 1',
          apiUrl: 'https://api.prod-eu-1.example.com:6443',
          environment: 'production',
          webConsoleUrl: null,
          description: null,
          caBundle: null,
          skipTlsVerify: false,
          version: 4,
        },
      }),
      apiClient.DELETE('/api/admin/clusters/{name}', cluster),
      apiClient.POST('/api/admin/clusters/{name}/enable', { ...cluster, body: { version: 4 } }),
      apiClient.POST('/api/admin/clusters/{name}/disable', { ...cluster, body: { version: 4 } }),
      apiClient.GET('/api/admin/clusters/{name}/grants', cluster),
      apiClient.GET('/api/admin/clusters/{name}/credentials', cluster),
      apiClient.POST('/api/admin/clusters/{name}/credentials', {
        ...cluster,
        body: { name: 'fleet-view', description: null, token: 'fake-token-for-tests' },
      }),
      apiClient.PUT('/api/admin/clusters/{name}/credentials/{credentialId}/token', {
        ...credential,
        body: { token: 'fake-token-for-tests', version: 2 },
      }),
      apiClient.DELETE('/api/admin/clusters/{name}/credentials/{credentialId}', credential),
      apiClient.POST('/api/admin/clusters/{name}/credentials/{credentialId}/test', {
        ...credential,
        body: { inspectNamespace: null },
      }),
      apiClient.POST('/api/admin/clusters/{name}/test-token', {
        ...cluster,
        body: { token: 'fake-token-for-tests', credentialId: null, inspectNamespace: 'default' },
      }),
      apiClient.GET('/api/admin/credentials'),
      apiClient.POST('/api/admin/grants', {
        body: { username: 'alice', clusterName: 'prod-eu-1', credentialId: CREDENTIAL_ID },
      }),
      apiClient.PUT('/api/admin/grants/{grantId}', {
        ...grant,
        body: { accessMode: 'readWrite', credentialId: CREDENTIAL_ID, version: 1 },
      }),
      apiClient.DELETE('/api/admin/grants/{grantId}', grant),
      apiClient.GET('/api/admin/audit', {
        params: { query: { category: 'grants', cluster: 'prod-eu-1', limit: 50 } },
      }),
    ]);

    const u = '/api/admin/users/alice%20smith';
    const c = '/api/admin/clusters/prod-eu-1';
    expect(seen.sort()).toEqual(
      [
        'POST /api/auth/logout',
        'GET /api/auth/me',
        'GET /api/clusters',
        'GET /api/admin/users',
        'POST /api/admin/users',
        `GET ${u}`,
        `PUT ${u}/role`,
        `PUT ${u}/read-only`,
        `POST ${u}/deactivate`,
        `POST ${u}/reactivate`,
        `GET ${u}/grants`,
        `POST ${u}/grants/bulk`,
        'GET /api/admin/clusters',
        'POST /api/admin/clusters',
        `GET ${c}`,
        `PUT ${c}`,
        `DELETE ${c}`,
        `POST ${c}/enable`,
        `POST ${c}/disable`,
        `GET ${c}/grants`,
        `GET ${c}/credentials`,
        `POST ${c}/credentials`,
        `PUT ${c}/credentials/${CREDENTIAL_ID}/token`,
        `DELETE ${c}/credentials/${CREDENTIAL_ID}`,
        `POST ${c}/credentials/${CREDENTIAL_ID}/test`,
        `POST ${c}/test-token`,
        'GET /api/admin/credentials',
        'POST /api/admin/grants',
        `PUT /api/admin/grants/${GRANT_ID}`,
        `DELETE /api/admin/grants/${GRANT_ID}`,
        'GET /api/admin/audit?category=grants&cluster=prod-eu-1&limit=50',
      ].sort(),
    );
  });

  it('rejects calls that do not match the contract at compile time', () => {
    // Type-only assertions: these calls are never executed.
    const typeOnly = () => {
      // @ts-expect-error -- unknown route
      void apiClient.GET('/api/admin/nope');
      void apiClient.POST('/api/admin/users/{username}/deactivate', {
        params: { path: { username: 'a' } },
        // @ts-expect-error -- version is required on transitions
        body: {},
      });
      void apiClient.GET('/api/admin/audit', {
        // @ts-expect-error -- limit must be a number
        params: { query: { limit: 'fifty' } },
      });
      void apiClient.GET('/api/admin/audit', {
        // category is bound as a string server-side but documented as AuditCategory (T-0048).
        // @ts-expect-error -- unknown audit category
        params: { query: { category: 'everything' } },
      });
    };
    expect(typeOnly).toBeTypeOf('function');
  });
});
