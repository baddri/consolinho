import { apiClient, unwrap, unwrapNoContent } from '@/shared/api';
import { expectApiError } from '@/test/apiError';
import { credentialIds, FAKE_CA_BUNDLE, mockDb } from '@/test/handlers';

const cluster = (name: string) => ({ params: { path: { name } } });
const credential = (name: string, credentialId: string) => ({ params: { path: { name, credentialId } } });

describe('mock clusters API (contract §8.2)', () => {
  it('derives list rows: tls mode, counts, worst expiry and the newest test', async () => {
    const rows = await unwrap(apiClient.GET('/api/admin/clusters'));

    expect(rows.map((r) => r.name)).toEqual([
      'dev-1',
      'dev-2',
      'lab-1',
      'prod-eu-1',
      'prod-us-1',
      'staging-eu-1',
    ]);
    expect(rows.find((r) => r.name === 'prod-us-1')).toMatchObject({
      tlsMode: 'systemTrust',
      credentialCount: 2,
      worstCredentialExpiryStatus: 'expired',
      lastTest: { succeeded: false, failedStep: 'authentication' },
      lastTestCredentialName: 'fleet-view',
    });
    expect(rows.find((r) => r.name === 'staging-eu-1')).toMatchObject({
      tlsMode: 'skipVerify',
      lastTest: { isStale: true },
    });
    expect(rows.find((r) => r.name === 'lab-1')).toMatchObject({
      credentialCount: 0,
      worstCredentialExpiryStatus: null,
      lastTest: null,
    });
  });

  it('validates register (name regex, skip TLS + CA bundle) with field errors', async () => {
    const error = await expectApiError(
      unwrap(
        apiClient.POST('/api/admin/clusters', {
          body: {
            name: 'Bad_Name',
            displayName: null,
            apiUrl: 'http://api.x.example.com',
            environment: 'staging',
            webConsoleUrl: null,
            description: null,
            caBundle: FAKE_CA_BUNDLE,
            skipTlsVerify: true,
          },
        }),
      ),
    );

    expect(Object.keys(error.fieldErrors).sort()).toEqual(['apiUrl', 'name', 'skipTlsVerify']);
    expect(error.fieldErrors.skipTlsVerify).toEqual([
      'Skip TLS verification and a CA bundle are mutually exclusive.',
    ]);
  });

  it('marks stored tests stale when connection settings change (CLU-4)', async () => {
    const before = await unwrap(apiClient.GET('/api/admin/clusters/{name}', cluster('prod-eu-1')));

    const updated = await unwrap(
      apiClient.PUT('/api/admin/clusters/{name}', {
        ...cluster('prod-eu-1'),
        body: { ...before, apiUrl: 'https://api.new-prod-eu-1.example.com:6443/', version: before.version },
      }),
    );
    const credentials = await unwrap(
      apiClient.GET('/api/admin/clusters/{name}/credentials', cluster('prod-eu-1')),
    );

    expect(updated).toMatchObject({
      apiUrl: 'https://api.new-prod-eu-1.example.com:6443',
      version: before.version + 1,
    });
    expect(credentials.every((c) => c.lastTest?.isStale === true)).toBe(true);
  });

  it('deletes only disabled clusters, together with their credentials and grants (CLU-6)', async () => {
    const enabled = await expectApiError(
      unwrapNoContent(apiClient.DELETE('/api/admin/clusters/{name}', cluster('dev-1'))),
    );
    expect([enabled.status, enabled.code]).toEqual([409, 'Clusters.NotDisabled']);

    await unwrapNoContent(apiClient.DELETE('/api/admin/clusters/{name}', cluster('dev-2')));

    expect(mockDb.credentials.some((c) => c.clusterName === 'dev-2')).toBe(false);
    expect(mockDb.grants.some((g) => g.clusterName === 'dev-2')).toBe(false);
    const missing = await expectApiError(
      unwrap(apiClient.GET('/api/admin/clusters/{name}', cluster('dev-2'))),
    );
    expect(missing.code).toBe('Clusters.NotFound');
  });
});

describe('mock credentials API (contract §8.4, §8.5)', () => {
  it('lists fleet credentials by soonest expiry, nulls last, with every expiry status', async () => {
    const list = await unwrap(apiClient.GET('/api/admin/credentials'));

    expect(list.map((c) => c.expiryStatus)).toEqual([
      'expired',
      'expiringSoon',
      'ok',
      'ok',
      'ok',
      'unknown',
      'noExpiry',
    ]);
    expect(list.every((c) => c.expiryWarningDays === 14)).toBe(true);
  });

  it('adds a credential from an opaque token and refuses whitespace and duplicate names', async () => {
    const whitespace = await expectApiError(
      unwrap(
        apiClient.POST('/api/admin/clusters/{name}/credentials', {
          ...cluster('lab-1'),
          body: { name: 'fleet-view', description: null, token: 'abc def' },
        }),
      ),
    );
    const added = await unwrap(
      apiClient.POST('/api/admin/clusters/{name}/credentials', {
        ...cluster('lab-1'),
        body: { name: 'fleet-view', description: null, token: '  sha256~opaque-token  ' },
      }),
    );
    const duplicate = await expectApiError(
      unwrap(
        apiClient.POST('/api/admin/clusters/{name}/credentials', {
          ...cluster('lab-1'),
          body: { name: 'fleet-view', description: null, token: 'other' },
        }),
      ),
    );

    expect(whitespace.fieldErrors).toEqual({ token: ['The token must not contain spaces or line breaks.'] });
    expect(added).toMatchObject({ tokenType: 'opaque', expiryStatus: 'unknown', clusterName: 'lab-1' });
    expect(added.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(duplicate.code).toBe('Credentials.NameTaken');
  });

  it('refuses to delete a credential in use (409 Credentials.InUse)', async () => {
    const error = await expectApiError(
      unwrapNoContent(
        apiClient.DELETE(
          '/api/admin/clusters/{name}/credentials/{credentialId}',
          credential('prod-eu-1', credentialIds.prodEuView),
        ),
      ),
    );
    expect(error.detail).toBe('Credential fleet-view is used by 2 grants. Re-assign or revoke them first.');
  });

  it('tests a credential with its canned result, stores it as lastTest and adds TEST-4 hints', async () => {
    const result = await unwrap(
      apiClient.POST('/api/admin/clusters/{name}/credentials/{credentialId}/test', {
        ...credential('prod-eu-1', credentialIds.prodEuView),
        body: { inspectNamespace: 'payments' },
      }),
    );
    const [stored] = (
      await unwrap(apiClient.GET('/api/admin/clusters/{name}/credentials', cluster('prod-eu-1')))
    ).filter((c) => c.id === credentialIds.prodEuView);

    expect(result.succeeded).toBe(true);
    expect(result.steps).toHaveLength(5);
    expect(result.namespaceRules?.namespace).toBe('payments');
    expect(result.hints).toEqual([
      {
        severity: 'warning',
        message: '1 users have ReadWrite grants with this credential but it cannot modify workloads',
      },
    ]);
    expect(stored?.lastTest).toMatchObject({ succeeded: true, headline: 'clusterWideView', isStale: false });
  });

  it('tests an unsaved token by prefix: tls- fails at reachability, bad- at authentication', async () => {
    const run = (token: string) =>
      unwrap(
        apiClient.POST('/api/admin/clusters/{name}/test-token', {
          ...cluster('dev-1'),
          body: { token, credentialId: null, inspectNamespace: null },
        }),
      );

    const tls = await run('tls-whatever');
    const bad = await run('bad-whatever');
    const good = await run('good-token');

    expect(tls.steps[0]).toMatchObject({ status: 'failed', failureKind: 'tlsUnknownAuthority' });
    expect(bad.steps[1]).toMatchObject({ step: 'authentication', status: 'failed' });
    expect(good.succeeded).toBe(true);
  });

  it('rotates a token keeping id and grants, with a version check', async () => {
    const path = credential('prod-eu-1', credentialIds.prodEuEdit);
    const stale = await expectApiError(
      unwrap(
        apiClient.PUT('/api/admin/clusters/{name}/credentials/{credentialId}/token', {
          ...path,
          body: { token: 'new-token', version: 99 },
        }),
      ),
    );
    const rotated = await unwrap(
      apiClient.PUT('/api/admin/clusters/{name}/credentials/{credentialId}/token', {
        ...path,
        body: { token: 'new-token', version: 1 },
      }),
    );

    expect(stale.code).toBe('Concurrency.Conflict');
    expect(rotated).toMatchObject({
      id: credentialIds.prodEuEdit,
      grantCount: 1,
      version: 2,
      rotatedBy: 'admin',
    });
  });
});
