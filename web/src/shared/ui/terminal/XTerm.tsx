import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITerminalOptions } from '@xterm/xterm';
import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref } from 'react';
import styles from './XTerm.module.css';

/** OCP `terminal.tsx` defaults: Red Hat Mono 16px, no blinking cursor; black background, white text (`_terminal.scss`). */
const TERMINAL_OPTIONS: ITerminalOptions = {
  fontFamily: '"Red Hat Mono", RedHatMono, monospace',
  fontSize: 16,
  cursorBlink: false,
  theme: { background: '#000000', foreground: '#ffffff' },
};

/** Imperative handle of {@link XTerm}. */
export interface XTermHandle {
  /** Writes output (bytes are decoded as UTF-8 by xterm, split sequences included). */
  write: (data: string | Uint8Array) => void;
  focus: () => void;
  /** Clears the screen and scrollback, e.g. before a new session prints. */
  reset: () => void;
}

/** Props of {@link XTerm}. */
export interface XTermProps {
  ref?: Ref<XTermHandle>;
  /** Input the user typed or pasted. */
  onData: (data: string) => void;
  /** The terminal's size in character cells after a fit; called once after mount and on every change. */
  onResize: (cols: number, rows: number) => void;
  /** Ignore keyboard input (the session closed), as OCP's `onConnectionClosed`. */
  isInputDisabled?: boolean;
  /** Accessible name of the terminal's input. */
  'aria-label'?: string;
}

/**
 * xterm.js in a black area that fills its parent (OCP `public/components/terminal.tsx`). The only code that mounts a
 * DOM library (ADR-0037 §5, FRONTEND.md): `Terminal.open()` into a `div` this component owns, never the document. A
 * `ResizeObserver` on that `div` refits the terminal and reports the new size; everything is disposed on unmount.
 * While the terminal has focus it keeps Tab and other keys for the shell (TERM-10, UX.md §12).
 */
export function XTerm({
  ref,
  onData,
  onResize,
  isInputDisabled = false,
  'aria-label': ariaLabel,
}: XTermProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const emitData = useEffectEvent(onData);
  const emitResize = useEffectEvent(onResize);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const terminal = new Terminal(TERMINAL_OPTIONS);
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminalRef.current = terminal;
    const dataListener = terminal.onData((data) => emitData(data));

    let reported = '';
    const refit = () => {
      try {
        fit.fit();
      } catch {
        // The renderer is not ready yet (e.g. a hidden or zero-sized parent); the next resize fits.
      }
      const size = `${terminal.cols}x${terminal.rows}`;
      if (size !== reported) {
        reported = size;
        emitResize(terminal.cols, terminal.rows);
      }
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refit);
    observer?.observe(container);
    refit();
    terminal.focus();

    return () => {
      observer?.disconnect();
      dataListener.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.disableStdin = isInputDisabled;
  }, [isInputDisabled]);

  useImperativeHandle(
    ref,
    () => ({
      write: (data) => terminalRef.current?.write(data),
      focus: () => terminalRef.current?.focus(),
      reset: () => {
        terminalRef.current?.reset();
        terminalRef.current?.clear();
      },
    }),
    [],
  );

  return <div ref={containerRef} className={styles.terminal} role="group" aria-label={ariaLabel} />;
}
