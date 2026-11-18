import { createContext } from 'react';

/** Colour theme supported by PatternFly 6. */
export type Theme = 'light' | 'dark';

/** Value exposed by {@link ThemeProvider} through {@link useTheme}. */
export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
