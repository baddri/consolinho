import { parseQuantity } from '@/shared/k8s';

/** The units of OCP's Expand PVC size dropdown (`expand-pvc-modal.tsx` `dropdownUnits`), value → shown label. */
export const EXPAND_SIZE_UNITS = { Mi: 'MiB', Gi: 'GiB', Ti: 'TiB' } as const;

/** One of {@link EXPAND_SIZE_UNITS}. */
export type ExpandSizeUnit = keyof typeof EXPAND_SIZE_UNITS;

/** A size as the modal edits it: the number as typed and its unit. */
export interface ExpandSize {
  value: string;
  unit: ExpandSizeUnit;
}

const UNIT_BYTES: Readonly<Record<ExpandSizeUnit, number>> = { Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40 };

/**
 * The modal's starting size from the claim's request (OCP `humanizeBinaryBytesWithoutB` split into value + unit):
 * the largest of Mi / Gi / Ti the size reaches, at most two decimals. An unparsable or missing request starts empty
 * in Gi, as OCP's default unit.
 */
export function initialExpandSize(request: string | undefined): ExpandSize {
  const bytes = parseQuantity(request);
  if (bytes === undefined || bytes <= 0) return { value: '', unit: 'Gi' };
  const unit: ExpandSizeUnit = bytes >= UNIT_BYTES.Ti ? 'Ti' : bytes >= UNIT_BYTES.Gi ? 'Gi' : 'Mi';
  return { value: String(Math.round((bytes / UNIT_BYTES[unit]) * 100) / 100), unit };
}

/**
 * The current request in `unit` (OCP `minValue`: the size field can't step below it), so the minimum follows a unit
 * change; 0 when the request is missing or unparsable.
 */
export function minExpandValue(currentRequest: string | undefined, unit: ExpandSizeUnit): number {
  const bytes = parseQuantity(currentRequest);
  return bytes === undefined || bytes <= 0 ? 0 : bytes / UNIT_BYTES[unit];
}

/**
 * Why `value` + `unit` can't be the claim's new size, or `undefined` when it can: it must be a positive number
 * (required, OCP `isRequired`) greater than `currentRequest` (*fleet* copy; OCP only states the rule in the
 * description). With no parsable current request only positivity is checked: the cluster stays the authority.
 */
export function validateExpandSize(
  value: string,
  unit: ExpandSizeUnit,
  currentRequest: string | undefined,
): string | undefined {
  const text = value.trim();
  const number = Number(text);
  if (text === '' || !Number.isFinite(number) || number <= 0) return 'Size must be a positive number.';
  const requested = parseQuantity(`${text}${unit}`);
  const current = parseQuantity(currentRequest);
  if (requested === undefined) return 'Size must be a positive number.';
  if (current !== undefined && requested <= current) {
    return `Size must be greater than the current size (${currentRequest ?? ''}).`;
  }
  return undefined;
}
