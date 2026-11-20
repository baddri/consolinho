import { useTheme } from '@/shared/theme';
import logoDark from './assets/consolinho-logo-dark.svg';
import logoLight from './assets/consolinho-logo.svg';

/**
 * User-facing product name (T-0055). The source code identity stays FleetConsole; everything a user reads uses this
 * constant, so a future rename is a one-line change. Storage keys, cookie names and config keys must NOT use it.
 */
export const PRODUCT_NAME = 'Consolinho';

/**
 * Wordmark logos: dark text for the light theme, light text for the dark theme. Imported (not in `public/`) so they
 * also load in `dev:mock`, whose public dir is `msw/`; Vite inlines or fingerprints them into `dist/`.
 */
export const LOGO_SRC = { light: logoLight, dark: logoDark } as const;

/** Logo URL matching the active colour theme; an `<img>` SVG cannot inherit `currentColor`, hence two files. */
export function useLogoSrc(): string {
  return LOGO_SRC[useTheme().theme];
}
