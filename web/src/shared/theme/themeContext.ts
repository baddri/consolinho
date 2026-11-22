import { createContext } from 'react';

/** Colour theme supported by PatternFly 6 — what is actually rendered. */
export type Theme = 'light' | 'dark';

/** What the user chose: a fixed theme, or `system` to follow the OS `prefers-color-scheme` setting live. */
export type ThemePreference = Theme | 'system';

/**
 * Rendered contrast mode, like OCP's `console.theme/contrast` (`ThemeProvider.tsx`): `glass` (PF 6 glass theme,
 * the default) or `contrast` (PF high-contrast theme). OCP's "Traditional" mode is not offered.
 */
export type Contrast = 'glass' | 'contrast';

/** What the user chose: a fixed contrast mode, or `system` = high contrast under OS `prefers-contrast: more`. */
export type ContrastPreference = Contrast | 'system';

/** Value exposed by {@link ThemeProvider} through {@link useTheme}. */
export interface ThemeContextValue {
  /** The user's colour scheme choice (remembered across reloads). */
  preference: ThemePreference;
  /** The resolved theme: `preference`, or the OS theme when `preference` is `system`. */
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
  /** The user's contrast mode choice (remembered across reloads). */
  contrastPreference: ContrastPreference;
  /** The resolved contrast mode: `contrastPreference`, or the OS setting when it is `system`. */
  contrast: Contrast;
  setContrastPreference: (preference: ContrastPreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
