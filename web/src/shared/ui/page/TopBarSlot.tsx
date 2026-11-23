import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The element in the shell's fixed top section (under the environment band, above the scrolling content) that page
 * bars such as the project bar render into, like OCP's `NamespaceBar` in `app-contents.tsx`. Provided by the app shell
 * from a ref callback (`useState`), so it is `null` until mounted and outside the shell (unit tests).
 */
export const TopBarSlotContext = createContext<HTMLElement | null>(null);

/**
 * Renders its children into the shell's fixed top section (UX.md §2 "Fixed top, scrolling body"), so a page keeps its
 * bar where it declares it and needs no layout knowledge; the bar stays put while the content below scrolls. Without
 * a slot (no shell) the children render in place.
 */
export function TopBar({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarSlotContext);
  return slot ? createPortal(children, slot) : children;
}
