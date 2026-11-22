import type { YamlEditorProps } from '../YamlEditor';

/**
 * Test double of {@link YamlEditor} (Monaco can't run in jsdom, ADR-0024 §4): a labelled `<textarea>` with the same
 * props, plus the toolbar controls' accessible names so tests can assert they are offered. Folding `managedFields` is
 * Monaco's (covered by the `managedFieldsLine` tests). Active in every test through `vi.mock` in `src/test/setup.ts`.
 */
export function YamlEditor({ value, onChange, isReadOnly, fullscreen }: YamlEditorProps) {
  return (
    <div>
      <button type="button" aria-label="Copy code to clipboard" />
      <button type="button" aria-label="Editor settings" />
      <button type="button" aria-label="Toggle fullscreen mode" disabled={!fullscreen.isSupported} />
      <textarea
        aria-label="YAML editor"
        value={value}
        readOnly={isReadOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
