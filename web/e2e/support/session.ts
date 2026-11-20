import { type APIRequestContext, type APIResponse, type Page } from '@playwright/test';

/** DevOAuth picker users (src/FleetConsole.DevOAuth/appsettings.json) the smoke uses. */
export type DevUser = 'admin' | 'alice' | 'e2e-user' | 'e2e-admin';

/**
 * DevOAuth users reserved for the smoke and kept grantless for H4 (`e2e-user` plain, `e2e-admin` in the admin
 * group). Setup only ever revokes grants of these two, never of the shared demo users (`bob`, `admin`, …).
 */
export const GRANTLESS_USERS = ['e2e-user', 'e2e-admin'] as const;

/**
 * Completes the OpenShift login through the DevOAuth emulator from FleetConsole's login page: clicks
 * "Log in with OpenShift", then picks `user` on the emulator's authorize page (one submit button per user).
 * The caller must already be on `/login` (directly or via a redirect).
 */
export async function loginAs(page: Page, user: DevUser): Promise<void> {
  await page.getByRole('link', { name: 'Log in with OpenShift' }).click();
  await page.locator(`button[name="username"][value="${user}"]`).click();
}

/** Header every mutating `/api` call needs (CSRF guard, web/src/shared/api/client.ts `CSRF_HEADER`). */
export const CSRF = { 'X-Console-Request': '1' };

/** Throws with the ProblemDetails body when an admin API call did not succeed, so seeding failures are readable. */
export async function ok(response: APIResponse, what: string): Promise<APIResponse> {
  if (!response.ok()) {
    throw new Error(`${what} failed: ${response.status()} ${await response.text()}`);
  }
  return response;
}

/** Shape of the admin API objects the helpers read (subset of the generated `components["schemas"]`). */
interface Versioned {
  name: string;
  version: number;
}

/**
 * Disables and deletes a cluster (the API only deletes disabled clusters; grants and credentials go with it). Ignores
 * a cluster that is already gone so cleanup can run twice.
 */
export async function deleteCluster(api: APIRequestContext, name: string): Promise<void> {
  const path = `/api/admin/clusters/${encodeURIComponent(name)}`;
  const current = await api.get(path);
  if (current.status() === 404) return;
  const cluster = (await (await ok(current, `GET ${path}`)).json()) as Versioned & { isEnabled: boolean };
  if (cluster.isEnabled) {
    await ok(
      await api.post(`${path}/disable`, { headers: CSRF, data: { version: cluster.version } }),
      'disable',
    );
  }
  await ok(await api.delete(path, { headers: CSRF }), `DELETE ${path}`);
}
