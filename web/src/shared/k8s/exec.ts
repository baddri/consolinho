import { PodModel } from './models';
import type { Status } from './types';
import { resourceApiPath } from './url';

/**
 * The Kubernetes `exec` WebSocket protocol as the Terminal tab speaks it (ADR-0037 §5): the URL and the
 * `base64.channel.k8s.io` frame codec. Every frame is text: one channel digit, then the base64 payload. Channels:
 * 0 stdin, 1 stdout, 2 stderr, 3 error (a `Status` JSON when the command ends), 4 resize (`{"Width","Height"}`).
 */

/** WebSocket subprotocol of the exec relay; the proxy forwards it to the API server unchanged. */
export const EXEC_SUBPROTOCOL = 'base64.channel.k8s.io';

/** OCP's shell command (`pod-connect.tsx`): an interactive `sh` with `TERM=xterm` so line editing and colours work. */
export const EXEC_SHELL_COMMAND: readonly string[] = ['sh', '-i', '-c', 'TERM=xterm sh'];

/** Options of {@link execUrl}. */
export interface ExecOptions {
  container: string;
  /** The command to run, one argv entry per `command` parameter; default {@link EXEC_SHELL_COMMAND}. */
  command?: readonly string[];
}

/**
 * Same-origin `ws(s)://` URL of a pod's exec subresource through the proxy, with stdin, stdout, stderr and a TTY.
 * `base` is the page URL (its scheme picks `ws:` or `wss:`); a parameter so tests and callers needn't read `location`.
 *
 * @example execUrl('dev-1', 'shop', 'web-1', { container: 'web' }, 'https://console.example.com/')
 */
export function execUrl(
  cluster: string,
  namespace: string,
  pod: string,
  { container, command = EXEC_SHELL_COMMAND }: ExecOptions,
  base: string,
): string {
  const path = resourceApiPath(cluster, PodModel, {
    namespace,
    name: pod,
    subresource: 'exec',
    query: { stdout: '1', stdin: '1', stderr: '1', tty: '1', container },
  });
  const url = new URL(path, base);
  // `command` repeats once per argv entry, which `resourceApiPath`'s query record can't express.
  for (const arg of command) url.searchParams.append('command', arg);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

const utf8Encoder = new TextEncoder();

/** Base64 of raw bytes via `btoa` (it takes a "binary string": one char per byte). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Raw bytes of a base64 string; throws (`atob`) on invalid input. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A stdin frame (channel 0) carrying `text` as UTF-8, e.g. what the user typed. */
export function encodeStdin(text: string): string {
  return `0${bytesToBase64(utf8Encoder.encode(text))}`;
}

/** A resize frame (channel 4): the terminal's size in character cells, as the kubelet's TTY expects it. */
export function encodeResize(cols: number, rows: number): string {
  return `4${bytesToBase64(utf8Encoder.encode(JSON.stringify({ Width: cols, Height: rows })))}`;
}

/** An output frame of the server: stdout (1), stderr (2) or the error channel (3), with its raw bytes. */
export interface ExecFrame {
  channel: 1 | 2 | 3;
  bytes: Uint8Array;
}

/**
 * Decodes one server frame; `undefined` for anything that isn't an output frame (empty, binary, an unknown channel,
 * broken base64), which the terminal ignores rather than crash on.
 */
export function decodeFrame(data: unknown): ExecFrame | undefined {
  if (typeof data !== 'string' || data.length === 0) return undefined;
  const channel = Number(data[0]);
  if (channel !== 1 && channel !== 2 && channel !== 3) return undefined;
  try {
    return { channel, bytes: base64ToBytes(data.slice(1)) };
  } catch {
    return undefined;
  }
}

/**
 * The message of an error-channel frame when the command failed (TERM-9, e.g. "no such file or directory" for a
 * container without `sh`), `undefined` for `status: Success`. A payload that isn't a `Status` is shown as text.
 */
export function execFailureMessage(bytes: Uint8Array): string | undefined {
  const text = new TextDecoder().decode(bytes);
  let status: Partial<Status> | undefined;
  try {
    status = JSON.parse(text) as Partial<Status>;
  } catch {
    return text || undefined;
  }
  if (status.status === 'Success') return undefined;
  return status.message ?? text;
}
