/** A binary data value: only its decoded size is shown, never its bytes. */
export interface BinaryValue {
  binarySize: number;
}

/** One value of a data section: text (shown, copyable) or {@link BinaryValue}. */
export type DataValue = string | BinaryValue;

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

const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Decodes one base64 Secret value (OCP `decodeBase64` + `isBinary`): the UTF-8 text, or a {@link BinaryValue} when
 * the bytes are not valid UTF-8 (or not valid base64). Callers must never log the result.
 */
export function decodeSecretValue(encoded: string): DataValue {
  try {
    const raw = atob(encoded);
    const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    return utf8.decode(bytes);
  } catch {
    return { binarySize: base64Size(encoded) };
  }
}

/** Every `binaryData` entry as a {@link BinaryValue}. */
export function binaryValues(data: Readonly<Record<string, string>> | undefined): Record<string, DataValue> {
  return Object.fromEntries(
    Object.entries(data ?? {}).map(([key, value]) => [key, { binarySize: base64Size(value) }]),
  );
}
