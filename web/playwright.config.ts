import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * The web URL of the running Aspire stack. `E2E_BASE_URL` wins; otherwise it is read from `aspire describe web`
 * (Aspire picks the Vite port at random). Resolved lazily-ish at config load: `undefined` makes global setup fail
 * with a readable message instead of Playwright guessing a URL.
 */
function resolveBaseUrl(): string | undefined {
  if (process.env.E2E_BASE_URL) return process.env.E2E_BASE_URL;
  try {
    const output = execFileSync(
      'aspire',
      ['describe', 'web', '--format', 'Json', '--nologo', '--non-interactive'],
      {
        // The repo root (where the AppHost lives), whatever directory Playwright was started from.
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return /"url":\s*"(http:\/\/localhost:\d+)"/.exec(output)?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Playwright smoke (T-0054): CP1 browser checks H1–H4 plus the CP2 QG-4 browsing step against a locally started
 * stack (`aspire start --launch-profile http && aspire wait web`), Chromium only. Specs are `e2e/*.e2e.ts` so Vitest
 * (default `*.test|spec.*` glob) never picks them up. Serial (`workers: 1`): the specs share seeded users and one
 * dev database, and H4 depends on the reserved users e2e-user/e2e-admin staying grantless.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  outputDir: './e2e/.results',
  timeout: 30_000,
  use: {
    baseURL: resolveBaseUrl(),
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
