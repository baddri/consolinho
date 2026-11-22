import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/**
 * Opens the app sidebar the way a user would and returns the "Global" navigation.
 *
 * jsdom has no layout (page width 0), so PatternFly `Page` always treats the viewport as mobile and starts with the
 * sidebar closed and `aria-hidden` — role queries cannot see the nav or the cluster switcher until it is opened.
 * Idempotent: when the sidebar is already open it is left open. `timeout` is for a file's cold-start wait.
 */
export async function openSidebar(user: UserEvent, timeout?: number): Promise<HTMLElement> {
  const open = screen.queryByRole('navigation', { name: 'Global' });
  if (open) return open;
  await user.click(await screen.findByRole('button', { name: 'Global navigation' }, { timeout }));
  return screen.findByRole('navigation', { name: 'Global' });
}

/**
 * Expands a collapsed sidebar section by clicking its title, like a user would: sections start collapsed (OCP
 * `NavSection.tsx`), so their links are hidden from role queries until expanded.
 */
export async function expandSection(user: UserEvent, nav: HTMLElement, title: string): Promise<void> {
  const toggle = await within(nav).findByRole('button', { name: title });
  if (toggle.getAttribute('aria-expanded') !== 'true') await user.click(toggle);
}
