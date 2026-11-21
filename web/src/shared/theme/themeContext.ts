import { createContext } from 'react';

/** Colour theme supported by PatternFly 6 — what is actually rendered. */
export type Theme = 'light' | 'dark';

/** What the user chose: a fixed theme, or `system` to follow the OS `prefers-color-scheme` setting live. */
export type ThemePreference = Theme | 'system';

/** Value exposed by {@link ThemeProvider} through {@link useTheme}. */
export interface ThemeContextValue {
  /** The user's choice (remembered across reloads). */
  preference: ThemePreference;
  /** The resolved theme: `preference`, or the OS theme when `preference` is `system`. */
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
