import { ClipboardCopyButton, CodeBlock, CodeBlockAction, CodeBlockCode } from '@patternfly/react-core';
import { useId, useState, type ReactNode } from 'react';

/** Props for {@link CopyableValue}. */
export interface CopyableValueProps {
  /** What the copy button writes to the clipboard. */
  value: string;
  /** What the block shows instead of `value`, e.g. a masked placeholder; defaults to `value`. */
  visibleValue?: ReactNode;
}

/**
 * A read-only value in a code block with a copy button (OCP `utils/copy-to-clipboard.tsx:CopyToClipboard`): the
 * tooltip reads "Copy to clipboard", then "Copied" until it hides. The copied text is always `value`, also while
 * `visibleValue` masks it (OCP Secret data).
 */
export function CopyableValue({ value, visibleValue }: CopyableValueProps) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => setCopied(true));
  };
  const actions = (
    <CodeBlockAction>
      <ClipboardCopyButton
        id={`copy-${id}`}
        aria-label="Copy to clipboard"
        onClick={copy}
        exitDelay={copied ? 1250 : 600}
        variant="plain"
        onTooltipHidden={() => setCopied(false)}
      >
        {copied ? 'Copied' : 'Copy to clipboard'}
      </ClipboardCopyButton>
    </CodeBlockAction>
  );
  return (
    <CodeBlock actions={actions}>
      <CodeBlockCode>{visibleValue ?? value}</CodeBlockCode>
    </CodeBlock>
  );
}
