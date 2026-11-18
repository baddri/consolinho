import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme } from './themeContext';

/** PatternFly 6 switches every design token to the dark palette when this class is on the root `<html>` element. */
const DARK_THEME_CLASS = 'pf-v6-theme-dark';
const STORAGE_KEY = 'fleetconsole.theme';

/** Reads the remembered theme; storage is a convenience only, so any failure falls back to the OS preference. */
function readInitialTheme(): Theme {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Storage blocked (private mode, policy) — ignore.
  }
  // matchMedia is missing in some non-browser environments (jsdom).
  return typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Owns the light/dark theme for the whole app and remembers the choice in `localStorage`.
 *
 * Applying the theme requires toggling a class on `<html>` (PatternFly defines its dark tokens on `:root`, and
 * popovers/menus are portalled outside the React tree). This effect is the single, deliberate exception to the
 * "no direct DOM access" rule.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    globalThis.document.documentElement.classList.toggle(DARK_THEME_CLASS, theme === 'dark');
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not persisting is acceptable.
    }
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
