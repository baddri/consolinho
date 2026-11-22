import { useStoredValue } from '@/shared/hooks';

/** Smallest editor font size (OCP's settings modal floor). */
export const MIN_FONT_SIZE = 5;
const DEFAULT_FONT_SIZE = 14;

const parseFontSize = (raw: string): number | undefined => {
  const size = Number(raw);
  return Number.isInteger(size) && size >= MIN_FONT_SIZE ? size : undefined;
};
/** Editor colour scheme: `default` follows the console theme (OCP `ThemeConfigItem`). */
export type EditorColorScheme = 'default' | 'dark' | 'light';

const parseColorScheme = (raw: string): EditorColorScheme | undefined =>
  raw === 'default' || raw === 'dark' || raw === 'light' ? raw : undefined;
const serializeColorScheme = (scheme: EditorColorScheme): string => scheme;

const parseFlag = (raw: string): boolean | undefined =>
  raw === 'true' ? true : raw === 'false' ? false : undefined;

/** The YAML editor's user settings (OCP "Editor settings" modal), applied immediately. */
export interface EditorSettings {
  colorScheme: EditorColorScheme;
  setColorScheme: (scheme: EditorColorScheme) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  /** Monaco hover tooltips. */
  showTooltips: boolean;
  setShowTooltips: (show: boolean) => void;
  /** Monaco sticky scroll: the enclosing keys stay pinned at the top while scrolling. */
  stickyScroll: boolean;
  setStickyScroll: (enabled: boolean) => void;
}

/**
 * The YAML editor settings (OCP `modals/edit-yaml-settings-modal.tsx`: colour scheme following the console, font size
 * 14, tooltips and sticky scroll on by default), remembered per browser in `localStorage['fleetconsole.yamlEditor.*']`
 * and shared live by every editor.
 */
export function useEditorSettings(): EditorSettings {
  const [colorScheme, setColorScheme] = useStoredValue(
    'fleetconsole.yamlEditor.colorScheme',
    parseColorScheme,
    serializeColorScheme,
  );
  const [fontSize, setFontSize] = useStoredValue('fleetconsole.yamlEditor.fontSize', parseFontSize, String);
  const [showTooltips, setShowTooltips] = useStoredValue(
    'fleetconsole.yamlEditor.tooltips',
    parseFlag,
    String,
  );
  const [stickyScroll, setStickyScroll] = useStoredValue(
    'fleetconsole.yamlEditor.stickyScroll',
    parseFlag,
    String,
  );
  return {
    colorScheme: colorScheme ?? 'default',
    setColorScheme,
    fontSize: fontSize ?? DEFAULT_FONT_SIZE,
    setFontSize: (size) => {
      // A cleared or non-numeric input keeps the current size.
      if (Number.isFinite(size)) setFontSize(Math.max(MIN_FONT_SIZE, Math.round(size)));
    },
    showTooltips: showTooltips ?? true,
    setShowTooltips,
    stickyScroll: stickyScroll ?? true,
    setStickyScroll,
  };
}
