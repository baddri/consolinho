import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

/** The production build (`npm run build`) the CSP spec serves instead of the Vite dev server's modules. */
const DIST_DIR = fileURLToPath(new URL('../../dist/', import.meta.url));

/** Content types of the files Vite emits into `dist` (anything else is served as a binary blob). */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** One CSP violation, as reported by the page or the console. */
export interface CspViolation {
  source: 'event' | 'console';
  documentURI: string;
  directive: string;
  blockedURI: string;
  sample: string;
}

/**
 * Reads the CSP from a live Api response (ADR-0029: the Api is the single source of truth, `web/` never copies it).
 * `/api/system/info` is anonymous and goes through the Vite proxy, which forwards the header unchanged.
 */
export async function fetchApiCsp(page: Page): Promise<string> {
  const response = await page.request.get('/api/system/info');
  const csp = response.headers()['content-security-policy'];
  expect(csp, 'the Api must send Content-Security-Policy (T-0092)').toBeTruthy();
  return csp ?? '';
}

/**
 * Makes the browser load the SPA from `web/dist` (production build) under `csp`, while `/api/**` still reaches the
 * real Api through the Vite proxy. Documents and static assets of the stack's origin are fulfilled from `dist`; an
 * unknown path gets `index.html` (SPA fallback, as the Api does in production). The CSP header is added to every
 * fulfilled response, mirroring the Api's security-headers middleware (workers get their own policy from it).
 */
export async function serveProductionBuild(page: Page, origin: string, csp: string): Promise<void> {
  if (!existsSync(join(DIST_DIR, 'index.html'))) {
    throw new Error(`${DIST_DIR}index.html is missing: run \`npm run build\` in web/ before this spec.`);
  }
  // Only requests the page starts itself are routed: the target of a redirect the browser follows (the OAuth
  // callback's 302 back into the SPA) bypasses Playwright routes and is served by the Vite dev server, so callers
  // reload after a redirect into the SPA (see `reloadFromBuild`).
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith('/api/')) return route.continue();
    const candidate = normalize(join(DIST_DIR, decodeURIComponent(url.pathname)));
    const isAsset = candidate.startsWith(DIST_DIR) && existsSync(candidate) && statSync(candidate).isFile();
    const file = isAsset ? candidate : join(DIST_DIR, 'index.html');
    return route.fulfill({
      status: 200,
      headers: {
        'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
        'content-security-policy': csp,
      },
      body: readFileSync(file),
    });
  });
}

/**
 * Reloads the current SPA URL so its document comes from `dist` again after a redirect chain ended in the SPA (e.g.
 * login), which Playwright routes cannot intercept. Waits for `url` first.
 */
export async function reloadFromBuild(page: Page, url: RegExp): Promise<void> {
  await page.waitForURL(url);
  await page.reload();
}

/**
 * Collects CSP violations on every document and worker-creating page of `origin`: `securitypolicyviolation` events
 * (registered before any page script via an init script) and console errors that mention the policy. Returns the live
 * list; documents of other origins (the DevOAuth emulator) are ignored.
 */
export async function collectCspViolations(page: Page, origin: string): Promise<CspViolation[]> {
  const violations: CspViolation[] = [];
  await page.exposeFunction('__reportCspViolation', (violation: Omit<CspViolation, 'source'>) => {
    if (violation.documentURI.startsWith(origin)) violations.push({ source: 'event', ...violation });
  });
  // A string script: the e2e tsconfig has no DOM lib, and this runs in the page, not in Node.
  await page.addInitScript({
    content: `document.addEventListener('securitypolicyviolation', (e) =>
      window.__reportCspViolation({
        documentURI: e.documentURI,
        directive: e.effectiveDirective,
        blockedURI: e.blockedURI,
        sample: e.sample,
      }));`,
  });
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('Content Security Policy') &&
      page.url().startsWith(origin)
    ) {
      violations.push({
        source: 'console',
        documentURI: page.url(),
        directive: '',
        blockedURI: message.location().url,
        sample: message.text(),
      });
    }
  });
  return violations;
}
