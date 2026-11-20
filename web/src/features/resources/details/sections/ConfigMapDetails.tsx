import {
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import type { ConfigMap } from '@/shared/k8s';

/** Decoded byte length of a base64 string (`binaryData` values), without decoding it. */
export function base64Size(value: string): number {
  const clean = value.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/** "512 B", "1.2 KiB", "3.4 MiB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${String(+(bytes / (1024 * 1024)).toFixed(1))} MiB`;
  if (bytes >= 1024) return `${String(+(bytes / 1024).toFixed(1))} KiB`;
  return `${String(bytes)} B`;
}

/**
 * ConfigMap part of the Details tab (UI-4): each `data` key with its value in a read-only code block, then the
 * `binaryData` keys with their decoded size (the bytes themselves aren't shown).
 */
export function ConfigMapDetails({ obj }: { obj: ConfigMap }) {
  const data = Object.entries(obj.data ?? {});
  const binary = Object.entries(obj.binaryData ?? {});
  return (
    <Stack hasGutter>
      <StackItem>
        <Title headingLevel="h3">Data</Title>
      </StackItem>
      {data.length === 0 && <StackItem>No data</StackItem>}
      {data.map(([key, value]) => (
        <StackItem key={key}>
          <Title headingLevel="h4">{key}</Title>
          <CodeBlock aria-label={key}>
            <CodeBlockCode>{value}</CodeBlockCode>
          </CodeBlock>
        </StackItem>
      ))}
      {binary.length > 0 && (
        <>
          <StackItem>
            <Title headingLevel="h3">Binary data</Title>
          </StackItem>
          <StackItem>
            <DescriptionList aria-label="Binary data" isCompact isHorizontal>
              {binary.map(([key, value]) => (
                <DescriptionListGroup key={key}>
                  <DescriptionListTerm>{key}</DescriptionListTerm>
                  <DescriptionListDescription>{formatBytes(base64Size(value))}</DescriptionListDescription>
                </DescriptionListGroup>
              ))}
            </DescriptionList>
          </StackItem>
        </>
      )}
    </Stack>
  );
}
