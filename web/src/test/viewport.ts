import { vi } from 'vitest';

/**
 * Pretends the browser window is `width` pixels wide for the current test.
 *
 * jsdom reports `window.innerWidth` = 1024. PatternFly reads it for responsive behaviour. In particular,
 * `FilterToolbar` (`@/shared/table`) collapses filter labels into an "N filters applied" count below the `xl`
 * breakpoint (1200px), so the labels are absent from the accessibility tree and label queries fail silently.
 * Call this **before rendering** in tests that assert on toolbar labels:
 *
 * @example
 * beforeEach(() => mockViewportWidth(1440));
 *
 * It is a `vi.spyOn`, which `restoreMocks: true` (vite.config.ts) undoes after each test. Do not set a width
 * globally in `setup.ts`: that would also change how PF `Page`/sidebar behaves in the shell tests.
 */
export function mockViewportWidth(width: number): void {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(width);
}
