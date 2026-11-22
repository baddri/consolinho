import { CodeBlock, CodeBlockCode, DescriptionList } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import type { ConfigMap } from '@/shared/k8s';
import { DetailsItem, DetailsSubsection } from '@/shared/ui';

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
 * ConfigMap sections below the details grid (UI-4): each `data` key as a term over its value in a read-only code block
 * (OCP `ConfigMapDataView`), then the `binaryData` keys with their decoded size (the bytes themselves aren't shown).
 * A config map has no kind-specific summary fields, so the grid's right column stays empty (as in OCP).
 */
export function ConfigMapDetails({ obj }: { obj: ConfigMap }) {
  const data = Object.entries(obj.data ?? {});
  const binary = Object.entries(obj.binaryData ?? {});
  return (
    <>
      <DetailsSubsection title="Data">
        {data.length === 0 ? (
          'No data'
        ) : (
          <DescriptionList aria-label="Data">
            {data.map(([key, value]) => (
              <DetailsItem key={key} label={key}>
                <CodeBlock aria-label={key}>
                  <CodeBlockCode>{value}</CodeBlockCode>
                </CodeBlock>
              </DetailsItem>
            ))}
          </DescriptionList>
        )}
      </DetailsSubsection>
      {binary.length > 0 && (
        <DetailsSubsection title="Binary data">
          <Table aria-label="Binary data" variant="compact">
            <Thead>
              <Tr>
                <Th>Key</Th>
                <Th>Size</Th>
              </Tr>
            </Thead>
            <Tbody>
              {binary.map(([key, value]) => (
                <Tr key={key}>
                  <Td dataLabel="Key">{key}</Td>
                  <Td dataLabel="Size">{formatBytes(base64Size(value))}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </DetailsSubsection>
      )}
    </>
  );
}
