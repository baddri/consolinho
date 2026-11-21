import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './themeContext';

/** Theme preference, resolved theme and the preference setter. Must be used below {@link ThemeProvider}. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return value;
}
