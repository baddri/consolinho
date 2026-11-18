import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './themeContext';

/** Current theme and its setter. Must be used below {@link ThemeProvider}. */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return value;
}
