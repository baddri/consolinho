import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemePreference } from './themeContext';

/*
 * PatternFly 6 theme classes on the root `<html>` element, set exactly like OCP's `public/index.html` (UX.md §1).
 * `web/index.html` applies the same classes in a pre-paint script so the first frame is already themed; keep the two
 * in sync (class names, storage key, media queries).
 */
/** Switches every design token to the dark palette. */
const DARK_THEME_CLASS = 'pf-v6-theme-dark';
/** Default contrast mode: floating sidebar card, background image, translucent main card. */
const GLASS_THEME_CLASS = 'pf-v6-theme-glass';
/** Contrast mode for users whose OS asks for more contrast; replaces glass. */
const HIGH_CONTRAST_THEME_CLASS = 'pf-v6-theme-high-contrast';
/** The OpenShift (commercial) palette; OCP sets it for every non-OKD branding, we set it always. */
const FELT_THEME_CLASS = 'pf-v6-theme-felt';
const STORAGE_KEY = 'fleetconsole.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const MORE_CONTRAST_QUERY = '(prefers-contrast: more)';

/** A media query; `undefined` where `matchMedia` is missing (some non-browser environments). */
function mediaQuery(query: string): MediaQueryList | undefined {
  return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query) : undefined;
}

/** `useSyncExternalStore` subscription to an OS media query, so the theme follows OS changes without a reload. */
function subscribeTo(query: string) {
  return (onChange: () => void): (() => void) => {
    const list = mediaQuery(query);
    list?.addEventListener('change', onChange);
    return () => list?.removeEventListener('change', onChange);
  };
}

const subscribeToOsTheme = subscribeTo(DARK_QUERY);
const subscribeToOsContrast = subscribeTo(MORE_CONTRAST_QUERY);

function readOsTheme(): Theme {
  return mediaQuery(DARK_QUERY)?.matches ? 'dark' : 'light';
}

function readOsMoreContrast(): boolean {
  return mediaQuery(MORE_CONTRAST_QUERY)?.matches ?? false;
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
 * the resolved theme, which follows the OS setting live while the preference is `system`. The contrast mode follows
 * the OS live: glass by default, high contrast under `prefers-contrast: more`; felt is always on.
 *
 * Applying the theme requires toggling a class on `<html>` (PatternFly defines its dark tokens on `:root`, and
 * popovers/menus are portalled outside the React tree). This module is the single, deliberate exception to the
 * "no direct DOM access" rule.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readInitialPreference);
  const osTheme = useSyncExternalStore(subscribeToOsTheme, readOsTheme);
  const theme: Theme = preference === 'system' ? osTheme : preference;

  const moreContrast = useSyncExternalStore(subscribeToOsContrast, readOsMoreContrast);

  useEffect(() => {
    globalThis.document.documentElement.classList.toggle(DARK_THEME_CLASS, theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const { classList } = globalThis.document.documentElement;
    classList.add(FELT_THEME_CLASS);
    classList.toggle(GLASS_THEME_CLASS, !moreContrast);
    classList.toggle(HIGH_CONTRAST_THEME_CLASS, moreContrast);
  }, [moreContrast]);

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
