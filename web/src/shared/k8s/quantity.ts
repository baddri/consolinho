/**
 * Kubernetes resource quantities (`10Gi`, `500M`, `100m`, `1e3`): parsing to base units and OCP's binary-bytes
 * rendering. Pure; used for storage capacity (PV/PVC) and node capacity.
 */

/** Multiplier of each quantity suffix: binary (`Ki`…`Ei`), decimal SI (`k`…`E`) and milli (`m`). */
const SUFFIX_MULTIPLIERS: Readonly<Record<string, number>> = {
  '': 1,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};

/** Signed decimal number, then either an exponent (`e3`, `E-2`) or a suffix. */
const QUANTITY = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:([eE][+-]?\d+)|(Ki|Mi|Gi|Ti|Pi|Ei|[mkMGTPE])?)$/;

/**
 * A Kubernetes quantity in base units (bytes for storage, cores for CPU): `1.5Gi` → 1610612736, `100m` → 0.1,
 * `1e3` → 1000. `undefined` for anything that isn't a quantity (or no value), so callers choose how to show it.
 */
export function parseQuantity(quantity: string | undefined): number | undefined {
  const match = quantity === undefined ? null : QUANTITY.exec(quantity.trim());
  if (!match) return undefined;
  const [, number = '', exponent, suffix = ''] = match;
  const value = Number(exponent === undefined ? number : `${number}${exponent}`);
  const multiplier = exponent === undefined ? SUFFIX_MULTIPLIERS[suffix] : 1;
  return multiplier === undefined || !Number.isFinite(value) ? undefined : value * multiplier;
}

const BINARY_BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'] as const;

/** OCP `getDefaultFractionDigits`: 3 below 1, 2 below 100, else 1. */
function fractionDigits(value: number): number {
  if (value < 1) return 3;
  return value < 100 ? 2 : 1;
}

/** `value` in the largest binary unit it reaches, starting at `unitIndex`. */
function toBinaryUnit(value: number, unitIndex: number): { value: number; unitIndex: number } {
  let current = value;
  let index = unitIndex;
  while (current >= 1024 && index < BINARY_BYTE_UNITS.length - 1) {
    current /= 1024;
    index += 1;
  }
  return { value: current, unitIndex: index };
}

/**
 * Bytes as OCP's `humanizeBinaryBytes(...).string`: `10 GiB`, `1.5 GiB`, `512 MiB` — largest binary unit, rounded
 * (3 digits below 1, 2 below 100, else 1), re-scaled if rounding reaches 1024. Negative or non-finite → `0 B`.
 */
export function formatBinaryBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const first = toBinaryUnit(safe, 0);
  const multiplier = 10 ** fractionDigits(first.value);
  const { value, unitIndex } = toBinaryUnit(Math.round(first.value * multiplier) / multiplier, first.unitIndex);
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: fractionDigits(value) }).format(value);
  return `${text} ${BINARY_BYTE_UNITS[unitIndex] ?? 'B'}`;
}
