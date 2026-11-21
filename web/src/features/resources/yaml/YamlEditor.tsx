// First: configures the bundled Monaco before `@monaco-editor/react` could reach for its CDN default (ADR-0024 §2).
import './monacoSetup';
import { CodeEditor, Language } from '@patternfly/react-code-editor';
import { Stack, StackItem } from '@patternfly/react-core';
import type { ReactNode } from 'react';

/** Props for {@link YamlEditor}. */
export interface YamlEditorProps {
  /** The YAML text shown; the editor is controlled by its parent. */
  value: string;
  /** Called with the full text after every edit (never called while read-only). */
  onChange: (value: string) => void;
  isReadOnly: boolean;
  /** File name of the Download control, without the `.yaml` extension the editor appends. */
  downloadFileName: string;
  /** Controls rendered above the editor (e.g. the "Show managed fields" switch). */
  toolbar?: ReactNode;
}

/**
 * The YAML editor (UI-6, ADR-0024 §4): PatternFly `CodeEditor` on the locally bundled Monaco (`monacoSetup.ts`, imported
 * first by this module, which only the lazy YAML route reaches) with Copy and Download controls. The only component
 * that renders `CodeEditor`. Monaco cannot run in jsdom, so `src/test/setup.ts` replaces this module in every test
 * with the `<textarea>` double in `__mocks__/` — keeping Monaco out of the test graph entirely.
 */
export function YamlEditor({ value, onChange, isReadOnly, downloadFileName, toolbar }: YamlEditorProps) {
  return (
    <Stack hasGutter>
      {toolbar !== undefined && <StackItem>{toolbar}</StackItem>}
      <StackItem isFilled>
        <CodeEditor
          code={value}
          onCodeChange={onChange}
          language={Language.yaml}
          isReadOnly={isReadOnly}
          isCopyEnabled
          isDownloadEnabled
          downloadFileName={downloadFileName}
          isLanguageLabelVisible
          // Fills the YAML tab down to the bottom of the content card (`UX.md` §7; the tab's section and stacks are
          // filled flex columns); Monaco scrolls long objects itself instead of growing the page.
          height="100%"
          options={{ ariaLabel: 'YAML editor', scrollBeyondLastLine: false, tabSize: 2 }}
        />
      </StackItem>
    </Stack>
  );
}
