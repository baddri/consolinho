import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useStoredValue } from '@/shared/hooks';
import {
  ThemeContext,
  type Contrast,
  type ContrastPreference,
  type Theme,
  type ThemePreference,
} from './themeContext';

/*
 * PatternFly 6 theme classes on the root `<html>` element, set exactly like OCP's `public/index.html` (UX.md §1).
 * `web/public/theme-init.js` applies the same classes in a pre-paint script so the first frame is already themed; keep
 * the two in sync (class names, storage keys and values, media queries).
 */
/** Switches every design token to the dark palette. */
const DARK_THEME_CLASS = 'pf-v6-theme-dark';
/** Default contrast mode: floating sidebar card, background image, translucent main card. */
const GLASS_THEME_CLASS = 'pf-v6-theme-glass';
/** High contrast mode; replaces glass. */
const HIGH_CONTRAST_THEME_CLASS = 'pf-v6-theme-high-contrast';
/** The OpenShift (commercial) palette; OCP sets it for every non-OKD branding, we set it always. */
const FELT_THEME_CLASS = 'pf-v6-theme-felt';
/** Raw `light` / `dark` / `system`; no per-user key, because the pre-paint script runs before the session is known. */
const THEME_STORAGE_KEY = 'fleetconsole.theme';
/** Raw `glass` / `contrast` / `system`. */
const CONTRAST_STORAGE_KEY = 'fleetconsole.contrast';
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

/** Stored values are raw strings; anything unknown counts as "not set" (= `system`). */
const parseThemePreference = (raw: string): ThemePreference | undefined =>
  raw === 'light' || raw === 'dark' || raw === 'system' ? raw : undefined;
const parseContrastPreference = (raw: string): ContrastPreference | undefined =>
  raw === 'glass' || raw === 'contrast' || raw === 'system' ? raw : undefined;
const serializeRaw = (value: string): string => value;

/**
 * Owns the theme for the whole app, like OCP's `ThemeProvider`: the colour scheme (light / dark / system) and the
 * contrast mode (glass / high contrast / system), both chosen on the User preferences page and remembered in
 * `localStorage` (shared live across tabs). `system` follows the OS live (`prefers-color-scheme`,
 * `prefers-contrast: more`). Felt is always on.
 *
 * Applying the theme requires toggling classes on `<html>` (PatternFly defines its theme tokens on `:root`, and
 * popovers/menus are portalled outside the React tree). This module is the single, deliberate exception to the
 * "no direct DOM access" rule.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [storedTheme, setPreference] = useStoredValue(THEME_STORAGE_KEY, parseThemePreference, serializeRaw);
  const [storedContrast, setContrastPreference] = useStoredValue(
    CONTRAST_STORAGE_KEY,
    parseContrastPreference,
    serializeRaw,
  );
  const preference = storedTheme ?? 'system';
  const contrastPreference = storedContrast ?? 'system';

  const osTheme = useSyncExternalStore(subscribeToOsTheme, readOsTheme);
  const theme: Theme = preference === 'system' ? osTheme : preference;

  const osMoreContrast = useSyncExternalStore(subscribeToOsContrast, readOsMoreContrast);
  const osContrast: Contrast = osMoreContrast ? 'contrast' : 'glass';
  const contrast: Contrast = contrastPreference === 'system' ? osContrast : contrastPreference;

  useEffect(() => {
    globalThis.document.documentElement.classList.toggle(DARK_THEME_CLASS, theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const { classList } = globalThis.document.documentElement;
    classList.add(FELT_THEME_CLASS);
    classList.toggle(GLASS_THEME_CLASS, contrast === 'glass');
    classList.toggle(HIGH_CONTRAST_THEME_CLASS, contrast === 'contrast');
  }, [contrast]);

  const value = useMemo(
    () => ({ preference, theme, setPreference, contrastPreference, contrast, setContrastPreference }),
    [preference, theme, setPreference, contrastPreference, contrast, setContrastPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
