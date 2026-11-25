import { useTheme } from '@/shared/theme';
import markDark from './assets/consolinho-mark-dark.svg';
import markLight from './assets/consolinho-mark.svg';

/**
 * User-facing product name (T-0055). The source code identity stays FleetConsole; everything a user reads uses this
 * constant, so a future rename is a one-line change. Storage keys, cookie names and config keys must NOT use it.
 */
export const PRODUCT_NAME = 'Consolinho';

/**
 * The product mark (T-0360): a 24px monochrome "stacked consoles" glyph with one muted teal accent. Only the mark is
 * an image; the masthead sets the name next to it as HTML text, because an `<img>` SVG cannot use the app's web font
 * (Red Hat Display). Dark strokes for the light theme, light strokes for dark surfaces. Imported (not in `public/`)
 * so they also load in `dev:mock`, whose public dir is `msw/`; Vite inlines or fingerprints them into `dist/`.
 */
export const MARK_SRC = { light: markLight, dark: markDark } as const;

/** Mark URL matching the active colour theme; an `<img>` SVG cannot inherit `currentColor`, hence two files. */
export function useMarkSrc(): string {
  return MARK_SRC[useTheme().theme];
}
