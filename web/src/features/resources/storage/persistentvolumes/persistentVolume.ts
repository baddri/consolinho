import type { PersistentVolume } from '@/shared/k8s';

/** The volume source of a PV as the Details tab prints it: `<type>: <detail>`. */
export interface PvSource {
  /** The `spec` key of the source, e.g. `csi`, `nfs`. */
  type: string;
  /** Where it points: CSI driver, `server:path`, host path; empty for sources without a summary. */
  detail: string;
}

/** `spec` keys of a PV that are not its volume source. */
const NON_SOURCE_KEYS: ReadonlySet<string> = new Set([
  'accessModes',
  'capacity',
  'claimRef',
  'mountOptions',
  'nodeAffinity',
  'persistentVolumeReclaimPolicy',
  'storageClassName',
  'volumeAttributesClassName',
  'volumeMode',
]);

/**
 * The PV's volume source (PV-1): `csi` → driver, `nfs` → `server:path`, `hostPath`/`local` → path; any other source
 * by its `spec` key with an empty detail. `undefined` when the spec names no source.
 */
export function pvSource(pv: PersistentVolume): PvSource | undefined {
  const spec = pv.spec ?? {};
  if (spec.csi) return { type: 'csi', detail: spec.csi.driver };
  if (spec.nfs) return { type: 'nfs', detail: `${spec.nfs.server}:${spec.nfs.path}` };
  if (spec.hostPath) return { type: 'hostPath', detail: spec.hostPath.path };
  if (spec.local) return { type: 'local', detail: spec.local.path };
  const type = Object.keys(spec).find((key) => !NON_SOURCE_KEYS.has(key));
  return type === undefined ? undefined : { type, detail: '' };
}

/** `pvSource` as one line: `csi: csi.example.com`, or the bare type when it has no detail. */
export function pvSourceText(source: PvSource): string {
  return source.detail ? `${source.type}: ${source.detail}` : source.type;
}

/**
 * The PV's required node affinity as plain text lines, one per requirement: `key operator v1, v2` (no values for
 * `Exists`/`DoesNotExist`). Terms are ORed by Kubernetes; their requirements are listed in order.
 */
export function nodeAffinityLines(pv: PersistentVolume): string[] {
  const terms = pv.spec?.nodeAffinity?.required?.nodeSelectorTerms ?? [];
  return terms.flatMap((term) =>
    [...(term.matchExpressions ?? []), ...(term.matchFields ?? [])].map((requirement) =>
      [requirement.key, requirement.operator, (requirement.values ?? []).join(', ')].filter(Boolean).join(' '),
    ),
  );
}

/** OCP `PVStatus`: `Terminating` while deleted, else `status.phase` (`Unknown` when unset). */
export function pvPhase(pv: PersistentVolume): string {
  return pv.metadata?.deletionTimestamp ? 'Terminating' : (pv.status?.phase ?? 'Unknown');
}

const BINARY_SUFFIXES: Readonly<Record<string, number>> = {
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};
const DECIMAL_SUFFIXES: Readonly<Record<string, number>> = {
  m: 1e-3,
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

/**
 * Bytes of a Kubernetes storage quantity (`10Gi`, `500M`, `1e9`) for sorting the Capacity column (OCP sorts by
 * `pvStorage`); `null` when absent or unparseable, which sorts last.
 */
export function quantityBytes(quantity: string | undefined): number | null {
  const match = quantity === undefined ? null : /^([0-9.]+(?:[eE][0-9]+)?)([a-zA-Z]*)$/.exec(quantity.trim());
  if (!match) return null;
  const [, number = '', suffix = ''] = match;
  const multiplier = BINARY_SUFFIXES[suffix] ?? DECIMAL_SUFFIXES[suffix];
  const value = Number(number);
  return multiplier === undefined || Number.isNaN(value) ? null : value * multiplier;
}
