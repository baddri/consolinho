import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { sanitizeReturnUrl } from '@/shared/auth';
import { userFixtures } from './fixtures';
import { handlers } from './handlers';
import { startK8sSimulator } from './k8s';
import { DEFAULT_MOCK_USER, setMockUser } from './session';

/**
 * Browser entry point of the MSW mock backend (ADR-0016 §4, T-0042), loaded only by `app/main.tsx` when Vite runs in
 * `mock` mode (`npm run dev:mock`). Production builds never reach the dynamic import, so neither this module nor MSW
 * ends up in `dist/`.
 */

/** Query parameter that switches persona without restarting Vite, e.g. `/?mockUser=alice`. */
const PERSONA_PARAM = 'mockUser';

/** Remembers the persona chosen through {@link PERSONA_PARAM} for the browser tab, so reloads keep it. */
const PERSONA_STORAGE_KEY = 'fleetconsole.mockUser';

/** Persona value that starts the mock backend signed out. */
const SIGNED_OUT = 'none';

/** Non-empty trimmed string, or `undefined`. `VITE_*` variables are untyped (`any`) in Vite's `ImportMetaEnv`. */
function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Picks the persona: `?mockUser=` in the page URL (stored for the tab), else the tab's stored choice, else
 * `VITE_MOCK_USER`, else {@link DEFAULT_MOCK_USER}. `none` means signed out; usernames come from `fixtures/users.ts`.
 */
function resolvePersona(): string | null {
  const fromUrl = nonEmpty(new URLSearchParams(globalThis.location.search).get(PERSONA_PARAM));
  if (fromUrl !== undefined) {
    globalThis.sessionStorage.setItem(PERSONA_STORAGE_KEY, fromUrl);
  }
  const envPersona: unknown = import.meta.env.VITE_MOCK_USER;
  const persona =
    fromUrl ??
    nonEmpty(globalThis.sessionStorage.getItem(PERSONA_STORAGE_KEY)) ??
    nonEmpty(envPersona) ??
    DEFAULT_MOCK_USER;
  if (persona === SIGNED_OUT) {
    return null;
  }
  if (!userFixtures.some((user) => user.username === persona)) {
    console.warn(
      `[mocks] Unknown persona "${persona}": it behaves as signed out. Known personas: ` +
        `${userFixtures.map((user) => user.username).join(', ')}, ${SIGNED_OUT}.`,
    );
  }
  return persona;
}

/**
 * Answers the "Log in with OpenShift" navigation (`/api/auth/login?returnUrl=…`), which the Api would turn into the
 * OAuth redirect. MSW 3 also intercepts navigations of pages it controls, so without this the shared `/api` guard
 * would answer it (401 after "Log out"). Redirecting to `returnUrl` reloads the app, and the reload restarts the mock
 * backend signed in as the configured persona. Browser-only: tests never navigate. `returnUrl` goes through the
 * contract's {@link sanitizeReturnUrl}, like the Api's; `vite.config.ts` answers the same way before the worker is active.
 */
const loginNavigation = http.get('*/api/auth/login', ({ request }) => {
  const target = sanitizeReturnUrl(new URL(request.url).searchParams.get('returnUrl'));
  return new HttpResponse(null, { status: 302, headers: { Location: target } });
});

/**
 * Sets the mock persona and starts the MSW service worker (`/mockServiceWorker.js`, served from `web/msw/` in mock
 * mode). Resolves once the worker intercepts requests, so the app must be rendered after it. Requests MSW has no
 * handler for (Vite modules, assets) pass through untouched; unknown `/api/*` routes still fail loudly through the
 * mocks' own catch-all. Mock data lives in memory: a page reload resets it. Also starts the Kubernetes activity
 * simulator, so watched lists change while you look at them.
 */
export async function startMockBackend(): Promise<void> {
  const persona = resolvePersona();
  setMockUser(persona);
  await setupWorker(loginNavigation, ...handlers).start({ onUnhandledFrame: 'bypass', quiet: true });
  startK8sSimulator();
  console.info(
    `[mocks] Mock backend active as ${persona ?? 'signed-out user'}. ` +
      `Switch persona with ?${PERSONA_PARAM}=<admin|alice|bob|ines|carol|none>.`,
  );
}
