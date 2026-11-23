import type { ConfigMap } from '@/shared/k8s';
import { DataSection } from './DataSection';
import { binaryValues } from './dataValues';

/**
 * ConfigMap sections below the details grid (CFG-1, OCP `configmap.tsx:ConfigMapDetails`): "Data" with each value
 * copyable, then "Binary data" with each key's decoded size (the bytes themselves aren't shown). Both always render,
 * empty ones with "No … found". A config map has no kind-specific summary fields, so the grid's right column stays
 * empty (as in OCP).
 */
export function ConfigMapDetails({ obj }: { obj: ConfigMap }) {
  return (
    <>
      <DataSection title="Data" data={obj.data ?? {}} />
      <DataSection title="Binary data" emptyLabel="binary data" data={binaryValues(obj.binaryData)} />
    </>
  );
}
