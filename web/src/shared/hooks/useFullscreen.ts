import { useCallback, useRef, useSyncExternalStore, type RefObject } from 'react';

/** Full screen state and controls, without the element ref (what the editor toolbar needs). */
export interface FullscreenControls {
  /** The browser is showing an element full screen (OCP `useIsFullscreen`). */
  isFullscreen: boolean;
  /** The browser allows full screen here (`document.fullscreenEnabled`); the toggle is disabled otherwise. */
  isSupported: boolean;
  /** Enters full screen with `ref`'s element, or leaves full screen. */
  toggle: () => void;
  /** Where overlays (modals) mount so they stay visible in full screen: `ref`'s element, else the body. */
  container: () => HTMLElement;
}

/** What {@link useFullscreen} returns: the element to show full screen and its controls. */
export interface Fullscreen<T extends HTMLElement = HTMLDivElement> extends FullscreenControls {
  /** Attach to the element that fills the screen (e.g. the YAML editor with its button bar, the log viewer; like OCP). */
  ref: RefObject<T | null>;
}

function subscribe(listener: () => void): () => void {
  document.addEventListener('fullscreenchange', listener);
  return () => document.removeEventListener('fullscreenchange', listener);
}

// jsdom and some embedded browsers don't implement the Fullscreen API, so the fields can be undefined at runtime.
const isFullscreenNow = () => (document.fullscreenElement ?? null) !== null;
const isSupportedNow = () => Boolean(document.fullscreenEnabled as boolean | undefined);

/**
 * The browser Fullscreen API for one element (OCP `console-shared/src/hooks/useFullscreen.ts`), behind the YAML
 * editor's "Toggle fullscreen mode" and the Logs tab's "Expand". Allowed to touch `document` (`eslint.config.js`):
 * full screen state and exit live on the document, not on an element. Errors (the browser
 * refused) are ignored; the state follows the `fullscreenchange` event either way.
 */
export function useFullscreen<T extends HTMLElement = HTMLDivElement>(): Fullscreen<T> {
  const ref = useRef<T>(null);
  const isFullscreen = useSyncExternalStore(subscribe, isFullscreenNow);
  const isSupported = useSyncExternalStore(subscribe, isSupportedNow);

  const toggle = useCallback(() => {
    if (isFullscreenNow()) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      ref.current?.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const container = useCallback(() => ref.current ?? document.body, []);

  return { ref, isFullscreen, isSupported, toggle, container };
}
