import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/**
 * Picks `category` in a `ConsoleDataView`'s filter category select (OCP's "Name ▾" toggle), like a user would.
 * `current` is the category shown on the toggle, "Name" until another one is picked.
 */
export async function chooseFilter(user: UserEvent, category: string, current = 'Name'): Promise<void> {
  const [toggle] = screen.getAllByRole('button', { name: current });
  if (!toggle) throw new Error(`category select "${current}" not found`);
  await user.click(toggle);
  await user.click(await screen.findByRole('menuitem', { name: category }));
}

/**
 * Selects `option` of the checkbox filter `category` (placeholder "Filter by <category lowercased>"): picks the
 * category first, then ticks the option in its menu.
 */
export async function checkFilterOption(
  user: UserEvent,
  category: string,
  option: string,
  current = 'Name',
): Promise<void> {
  if (current !== category) await chooseFilter(user, category, current);
  await user.click(screen.getByRole('button', { name: `Filter by ${category.toLowerCase()}` }));
  await user.click(await screen.findByRole('checkbox', { name: option }));
}

/**
 * Text of `element` without its kind badges, i.e. the name a user reads after the "U"/"C"/"CC" badge: `KindBadge` is
 * `aria-hidden` with the kind as its title, so its text is dropped. `''` for a missing element.
 */
export function withoutBadges(element: Element | undefined): string {
  if (!element) return '';
  const text = element.textContent;
  const badges = within(element as HTMLElement)
    .queryAllByTitle(/^(User|Cluster|Credential)$/)
    .filter((badge) => badge.getAttribute('aria-hidden') === 'true');
  return badges.reduce((rest, badge) => rest.replace(badge.textContent, ''), text);
}
