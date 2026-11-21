import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemePreference } from './themeContext';

/** PatternFly 6 switches every design token to the dark palette when this class is on the root `<html>` element. */
const DARK_THEME_CLASS = 'pf-v6-theme-dark';
const STORAGE_KEY = 'fleetconsole.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The OS dark-mode media query; `undefined` where `matchMedia` is missing (some non-browser environments). */
function darkQuery(): MediaQueryList | undefined {
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(DARK_QUERY) : undefined;
}

/** `useSyncExternalStore` subscription to OS theme changes, so `system` follows them without a reload. */
function subscribeToOsTheme(onChange: () => void): () => void {
  const query = darkQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

function readOsTheme(): Theme {
  return darkQuery()?.matches ? 'dark' : 'light';
}

/**
 * Reads the remembered preference. Values written before `system` existed (`light`/`dark`) stay valid; missing or
 * invalid values — and blocked storage, which is a convenience only — mean `system`.
 */
function readInitialPreference(): ThemePreference {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Storage blocked (private mode, policy) — ignore.
  }
  return 'system';
}

/**
 * Owns the theme for the whole app: the user's preference (light / dark / system, remembered in `localStorage`) and
 * the resolved theme, which follows the OS setting live while the preference is `system`.
 *
 * Applying the theme requires toggling a class on `<html>` (PatternFly defines its dark tokens on `:root`, and
 * popovers/menus are portalled outside the React tree). This module is the single, deliberate exception to the
 * "no direct DOM access" rule.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readInitialPreference);
  const osTheme = useSyncExternalStore(subscribeToOsTheme, readOsTheme);
  const theme: Theme = preference === 'system' ? osTheme : preference;

  useEffect(() => {
    globalThis.document.documentElement.classList.toggle(DARK_THEME_CLASS, theme === 'dark');
  }, [theme]);

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Not persisting is acceptable.
    }
  }, [preference]);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
