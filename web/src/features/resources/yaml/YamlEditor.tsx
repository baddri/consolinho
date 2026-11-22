// First: configures the bundled Monaco before `@monaco-editor/react` could reach for its CDN default (ADR-0024 §2).
import './monacoSetup';
import { CodeEditor, CodeEditorControl, Language } from '@patternfly/react-code-editor';
import { RhUiCompressIcon, RhUiExpandIcon, RhUiSettingsIcon } from '@patternfly/react-icons';
import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import { css } from '@patternfly/react-styles';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/shared/theme';
import { EditorSettingsModal } from './EditorSettingsModal';
import type { FullscreenControls } from './useFullscreen';
import { useEditorSettings } from './useEditorSettings';
import { useShortcutsPopover } from './useShortcutsPopover';
import { managedFieldsLine } from './yamlObject';
import styles from './YamlEditor.module.css';

/** Props for {@link YamlEditor}. */
export interface YamlEditorProps {
  /** The YAML text shown; the editor is controlled by its parent. */
  value: string;
  /** Called with the full text after every edit (never called while read-only). */
  onChange: (value: string) => void;
  isReadOnly: boolean;
  /** Ctrl/Cmd+S in the editor (OCP); omitted while saving isn't possible. */
  onSave?: () => void;
  /** The tab's full screen element; the toolbar's "Toggle fullscreen mode" control drives it. */
  fullscreen: FullscreenControls;
}

/**
 * The YAML editor (UI-6, ADR-0024 §4), OCP's `CodeEditor` (`console-shared/src/components/editor/`): PatternFly
 * `CodeEditor` on the locally bundled Monaco (`monacoSetup.ts`, imported first by this module, which only the lazy YAML
 * route reaches), full height, in the console theme unless the user's editor colour scheme overrides it. Toolbar like OCP: Copy, Editor settings, Toggle fullscreen
 * mode, and the right-aligned "Shortcuts" popover (hidden in full screen). On mount it takes focus, folds
 * `metadata.managedFields` (OCP `registerAutoFold`) and binds Ctrl/Cmd+S to `onSave`.
 *
 * The only component that renders `CodeEditor`. Monaco cannot run in jsdom, so `src/test/setup.ts` replaces this module
 * in every test with the `<textarea>` double in `__mocks__/`, keeping Monaco out of the test graph entirely.
 */
export function YamlEditor({ value, onChange, isReadOnly, onSave, fullscreen }: YamlEditorProps) {
  const { theme, contrast } = useTheme();
  const settings = useEditorSettings();
  const shortcuts = useShortcutsPopover();
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const isDark = settings.colorScheme === 'default' ? theme === 'dark' : settings.colorScheme === 'dark';
  const isHighContrast = contrast === 'contrast';

  // Monaco binds Ctrl/Cmd+S once at mount; the ref lets it always call the latest `onSave`.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const onEditorDidMount = (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    editor.focus();
    // Key bindings are bit flags.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());
    const line = managedFieldsLine(editor.getValue());
    if (line !== undefined) {
      // Folding regions are computed after mount, so fold on the next tick like OCP; `selectionLines` is 0-based.
      setTimeout(() => editor.trigger('auto-fold', 'editor.fold', { selectionLines: [line - 1], levels: 1 }));
    }
  };

  const controls = [
    <CodeEditorControl
      key="settings"
      icon={<RhUiSettingsIcon />}
      aria-label="Editor settings"
      aria-haspopup="dialog"
      tooltipProps={{ content: 'Editor settings' }}
      onClick={() => setSettingsOpen(true)}
    />,
    <CodeEditorControl
      key="fullscreen"
      icon={fullscreen.isFullscreen ? <RhUiCompressIcon /> : <RhUiExpandIcon />}
      aria-label="Toggle fullscreen mode"
      tooltipProps={{ content: 'Toggle fullscreen mode' }}
      isDisabled={!fullscreen.isSupported}
      onClick={fullscreen.toggle}
    />,
  ];

  return (
    <div className={css(styles.editor, isDark && !isHighContrast && styles.dark)}>
      <CodeEditor
        code={value}
        onCodeChange={onChange}
        language={Language.yaml}
        isReadOnly={isReadOnly}
        isDarkTheme={isDark}
        isHighContrastTheme={isHighContrast}
        isFullHeight
        isCopyEnabled
        copyButtonAriaLabel="Copy code to clipboard"
        copyButtonToolTipText="Copy code to clipboard"
        copyButtonSuccessTooltipText="Content copied to clipboard"
        customControls={controls}
        shortcutsPopoverButtonText="Shortcuts"
        shortcutsPopoverProps={fullscreen.isFullscreen ? undefined : shortcuts}
        onEditorDidMount={onEditorDidMount}
        options={{
          ariaLabel: 'YAML editor',
          fontFamily: 'var(--pf-t--global--font--family--mono)',
          fontSize: settings.fontSize,
          hover: { enabled: settings.showTooltips },
          stickyScroll: { enabled: settings.stickyScroll },
          readOnly: isReadOnly,
          scrollBeyondLastLine: false,
          tabSize: 2,
        }}
      />
      <EditorSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        appendTo={fullscreen.isFullscreen ? fullscreen.container : undefined}
      />
    </div>
  );
}
