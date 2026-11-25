import { DescriptionList } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { ConsoleEmptyState, DetailsItem, DetailsSubsection } from '@/shared/ui';
import { CopyableValue } from './CopyableValue';
import { formatBytes, type DataValue } from './dataValues';

/** Props for {@link DataSection}. */
export interface DataSectionProps {
  /** Section heading, e.g. "Data", "Binary data". */
  title: string;
  data: Readonly<Record<string, DataValue>>;
  /** Hide text values behind {@link MaskedData}; the copy button still copies them (OCP Secret data). */
  masked?: boolean;
  /** Label of the empty state, "No <label> found"; defaults to `title`. */
  emptyLabel?: string;
  /** Controls at the right end of the heading, e.g. the Secret reveal toggle. */
  actions?: ReactNode;
}

/**
 * OCP's hidden-value placeholder (`configmap-and-secret-data.tsx:MaskedData`): a dash for the eye, "Value hidden" for
 * screen readers. Fixed, so it leaks neither the value nor its length.
 */
function MaskedData() {
  return (
    <>
      <span className="pf-v6-screen-reader">Value hidden</span>
      <span aria-hidden="true">-</span>
    </>
  );
}

/** One value: subtle "No value" when empty, "<size> binary data" for bytes, else a copyable (maybe masked) block. */
function DataValueView({ value, masked }: { value: DataValue; masked: boolean }) {
  if (typeof value !== 'string') return <>{formatBytes(value.binarySize)} binary data</>;
  if (value === '') return <span className="pf-v6-u-text-color-subtle">No value</span>;
  return <CopyableValue value={value} visibleValue={masked ? <MaskedData /> : undefined} />;
}

/**
 * A data section of a ConfigMap or Secret (OCP `ConfigMapData`, `ConfigMapBinaryData`, `SecretData`): its keys in
 * sorted order, each a term over its value; "No <label> found" (OCP `EmptyBox`) without any.
 */
export function DataSection({ title, data, masked = false, emptyLabel = title, actions }: DataSectionProps) {
  const keys = Object.keys(data).sort();
  return (
    <DetailsSubsection title={title} actions={actions}>
      {keys.length === 0 ? (
        <ConsoleEmptyState>No {emptyLabel} found</ConsoleEmptyState>
      ) : (
        <DescriptionList aria-label={title}>
          {keys.map((key) => (
            <DetailsItem key={key} label={key}>
              <DataValueView value={data[key] ?? ''} masked={masked} />
            </DetailsItem>
          ))}
        </DescriptionList>
      )}
    </DetailsSubsection>
  );
}
