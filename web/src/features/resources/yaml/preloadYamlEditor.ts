import { useEffect } from 'react';

/** The one preload of this session; cleared when it fails, so a later preload (or the real route) retries. */
let preload: Promise<unknown> | undefined;

/**
 * Warms the YAML editor before the user opens it (T-0373): imports `ResourceYamlTab`, the same module as the lazy YAML
 * route (`routes.tsx`), so Vite fetches one chunk graph — `YamlEditor`, `monacoSetup` and the `vendor-monaco` chunks —
 * and the click later reuses it; then warms the two worker scripts. Memoised: runs once per session however often it
 * is called. Never rejects: a failure only resets the memo, and the real navigation shows the route error.
 * Same idea as OCP's `LazyActionMenu`, which loads its actions on hover.
 */
export function preloadYamlEditor(): Promise<unknown> {
  preload ??= Promise.all([
    import('./ResourceYamlTab'),
    import('./warmMonacoWorkers').then((m) => m.warmMonacoWorkers()),
  ]).catch(() => {
    preload = undefined;
  });
  return preload;
}

/** Delay before the preload where `requestIdleCallback` is missing (Safari). */
const FALLBACK_DELAY_MS = 2000;

/**
 * Runs {@link preloadYamlEditor} once the browser is idle (at most 5 s later), on pages where the YAML editor is one
 * click away (resource details, Deployment edit). Cancelled on unmount or when `enabled` turns false; falls back to a
 * 2 s timeout without `requestIdleCallback`. List pages don't call it, so list-only users never download Monaco.
 */
export function usePreloadYamlEditor(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => void preloadYamlEditor(), { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(() => void preloadYamlEditor(), FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled]);
}
