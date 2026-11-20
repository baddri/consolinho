import { Stack, StackItem } from '@patternfly/react-core';
import type { YamlEditorProps } from '../YamlEditor';

/**
 * Test double of {@link YamlEditor} (Monaco can't run in jsdom, ADR-0024 §4): a labelled `<textarea>` with the same
 * props, plus the Copy/Download controls' accessible names so tests can assert they are offered. Active in every test
 * through `vi.mock` in `src/test/setup.ts`.
 */
export function YamlEditor({ value, onChange, isReadOnly, downloadFileName, toolbar }: YamlEditorProps) {
  return (
    <Stack hasGutter>
      {toolbar !== undefined && <StackItem>{toolbar}</StackItem>}
      <StackItem>
        <button type="button" aria-label="Copy code to clipboard" />
        <button type="button" aria-label="Download code" data-file-name={`${downloadFileName}.yaml`} />
        <textarea
          aria-label="YAML editor"
          value={value}
          readOnly={isReadOnly}
          onChange={(event) => onChange(event.target.value)}
        />
      </StackItem>
    </Stack>
  );
}
