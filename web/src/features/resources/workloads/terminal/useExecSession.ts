import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { decodeFrame, encodeResize, encodeStdin, execFailureMessage, EXEC_SUBPROTOCOL } from '@/shared/k8s';

/** Lifecycle of one exec session. */
export type ExecSessionState = 'connecting' | 'open' | 'closed';

/** Options of {@link useExecSession}. */
export interface ExecSessionOptions {
  /** `execUrl(...)`; `undefined` opens no socket (no access, pod not running). */
  url: string | undefined;
  /** The session opened: the place to clear the previous session's screen. */
  onOpen: () => void;
  /** stdout and stderr bytes, in order (a TTY merges them anyway). */
  onOutput: (bytes: Uint8Array) => void;
  /** The command failed: the error channel's `Status` message (TERM-9, e.g. no `sh` in the image). */
  onFailure: (message: string) => void;
}

/** Result of {@link useExecSession}. */
export interface ExecSession {
  state: ExecSessionState;
  /** The server's close reason, if it gave one. */
  closeReason?: string;
  /** Sends input on stdin; dropped unless the session is open. */
  write: (text: string) => void;
  /** Reports the terminal size; remembered and sent again when a session opens (TERM-9 resize on fit). */
  resize: (cols: number, rows: number) => void;
  /** Opens a new session on the same URL (TERM-3 "Reconnect"); the proxy re-checks access on every upgrade. */
  reconnect: () => void;
}

/**
 * One `exec` WebSocket (`base64.channel.k8s.io`) for the Terminal tab, held in a ref. A new `url` (another container)
 * or `reconnect()` closes the current socket and opens a new one; unmount closes it (TERM-2, TERM-10). There is no
 * automatic reconnect (OCP has none): any close — `exit`, a lost connection (1006), the proxy's 60-min cap
 * (ADR-0036) — ends in `closed` and the user decides.
 */
export function useExecSession({ url, onOpen, onOutput, onFailure }: ExecSessionOptions): ExecSession {
  const socketRef = useRef<WebSocket | null>(null);
  const sizeRef = useRef<{ cols: number; rows: number } | undefined>(undefined);
  const [generation, setGeneration] = useState(0);
  // State of the socket `key` belongs to; a newer key not reported yet is still connecting.
  const [reported, setReported] = useState<{ key: string; state: ExecSessionState; closeReason?: string }>();
  const key = `${generation}:${url ?? ''}`;

  const emitOpen = useEffectEvent(onOpen);
  const emitOutput = useEffectEvent(onOutput);
  const emitFailure = useEffectEvent(onFailure);

  useEffect(() => {
    if (url === undefined) return undefined;
    const socketKey = `${generation}:${url}`;
    const socket = new WebSocket(url, EXEC_SUBPROTOCOL);
    socketRef.current = socket;
    socket.onopen = () => {
      setReported({ key: socketKey, state: 'open' });
      emitOpen();
      const size = sizeRef.current;
      if (size) socket.send(encodeResize(size.cols, size.rows));
    };
    socket.onmessage = (event: MessageEvent) => {
      const frame = decodeFrame(event.data);
      if (!frame) return;
      if (frame.channel === 3) {
        const message = execFailureMessage(frame.bytes);
        if (message !== undefined) emitFailure(message);
        return;
      }
      emitOutput(frame.bytes);
    };
    socket.onclose = (event: CloseEvent) => {
      setReported({ key: socketKey, state: 'closed', closeReason: event.reason || undefined });
    };
    return () => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [url, generation]);

  const write = useCallback((text: string) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(encodeStdin(text));
  }, []);

  const resize = useCallback((cols: number, rows: number) => {
    sizeRef.current = { cols, rows };
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(encodeResize(cols, rows));
  }, []);

  const reconnect = useCallback(() => setGeneration((value) => value + 1), []);

  const current = reported?.key === key ? reported : undefined;
  return {
    state: url === undefined ? 'closed' : (current?.state ?? 'connecting'),
    closeReason: current?.closeReason,
    write,
    resize,
    reconnect,
  };
}
