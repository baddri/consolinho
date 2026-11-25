import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { type APIRequestContext } from '@playwright/test';
import { CSRF, ok, type DevUser } from './session';

/**
 * What `scripts/kind-dev.sh tokens` prints (T-0377, KIND-3): the kind API URL, its CA bundle and short-lived tokens for
 * the seeded ServiceAccounts. Held in memory only; never written to disk or logged.
 */
export interface KindAccess {
  apiUrl: string;
  caBundle: string;
  /** ServiceAccount name (`fleet-viewer`, `team-a-editor`) → token. */
  tokens: ReadonlyMap<string, string>;
}

/** Repository root (the script resolves its own paths, but runs from anywhere). */
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * Runs `scripts/kind-dev.sh tokens` and parses its stdout. On failure only the script's stderr is rethrown: Node's
 * error would also carry stdout, which may already hold a token.
 */
export function readKindAccess(): KindAccess {
  let output: string;
  try {
    output = execFileSync('scripts/kind-dev.sh', ['tokens'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, KIND_TOKEN_DURATION: '1h' },
    });
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    throw new Error(
      `scripts/kind-dev.sh tokens failed (is kind up? scripts/kind-dev.sh up): ${stderr.trim()}`,
    );
  }
  const apiUrl = /^# API URL\n(\S+)$/m.exec(output)?.[1];
  const caBundle = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(output)?.[0];
  const tokens = new Map(
    [...output.matchAll(/^# Token for [^/\s]+\/(\S+) .*\n(\S+)$/gm)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );
  if (!apiUrl || !caBundle || tokens.size === 0) {
    throw new Error('Unexpected `scripts/kind-dev.sh tokens` output (URL, CA bundle or tokens missing).');
  }
  return { apiUrl, caBundle: `${caBundle}\n`, tokens };
}

/** Registers `name` as a Kubernetes cluster pointing at kind, trusting kind's CA (no skip-TLS). */
export async function registerKindCluster(
  api: APIRequestContext,
  name: string,
  kind: KindAccess,
): Promise<void> {
  await ok(
    await api.post('/api/admin/clusters', {
      headers: CSRF,
      data: {
        name,
        displayName: null,
        apiUrl: kind.apiUrl,
        environment: 'development',
        distribution: 'kubernetes',
        webConsoleUrl: null,
        description: 'Playwright kind e2e (T-0386); deleted after the run.',
        caBundle: kind.caBundle,
        skipTlsVerify: false,
      },
    }),
    `register ${name}`,
  );
}

/**
 * Adds the kind ServiceAccount `serviceAccount`'s token as a credential of the same name; returns its id.
 *
 * Posts with Node's `fetch` and the admin session's cookies (`context.storageState()`), not with a Playwright
 * `APIRequestContext`: Playwright traces every request context with request bodies, so a failure trace
 * (`trace: 'retain-on-failure'`) would write the token to disk. Errors report the status only.
 */
export async function addKindCredential(
  session: { baseURL: string; cookies: readonly { name: string; value: string }[] },
  cluster: string,
  kind: KindAccess,
  serviceAccount: string,
  inspectNamespaces: string[] | null = null,
): Promise<string> {
  const token = kind.tokens.get(serviceAccount);
  if (!token) throw new Error(`No token for ServiceAccount ${serviceAccount} in the kind-dev.sh output.`);
  const response = await fetch(new URL(`/api/admin/clusters/${cluster}/credentials`, session.baseURL), {
    method: 'POST',
    headers: {
      ...CSRF,
      'Content-Type': 'application/json',
      Cookie: session.cookies.map(({ name, value }) => `${name}=${value}`).join('; '),
    },
    body: JSON.stringify({ name: serviceAccount, description: null, token, inspectNamespaces }),
  });
  if (!response.ok) throw new Error(`add credential ${serviceAccount} failed: ${response.status}`);
  return ((await response.json()) as { id: string }).id;
}

/** Grants `username` (created first on a fresh database) `credentialId` on `cluster`. */
export async function grantKind(
  api: APIRequestContext,
  username: DevUser,
  cluster: string,
  credentialId: string,
  accessMode: 'readOnly' | 'readWrite',
): Promise<void> {
  if ((await api.get(`/api/admin/users/${username}`)).status() === 404) {
    await ok(await api.post('/api/admin/users', { headers: CSRF, data: { username } }), `create ${username}`);
  }
  await ok(
    await api.post('/api/admin/grants', {
      headers: CSRF,
      data: { username, clusterName: cluster, credentialId, accessMode },
    }),
    `grant ${username} on ${cluster}`,
  );
}
