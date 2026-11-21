import type { ThProps } from '@patternfly/react-table';

/**
 * PF `visibility` of a low-priority admin list column (`UX.md` §5): hidden below the `2xl` breakpoint (1450px), so a
 * 1280 screen keeps every header whole instead of overflowing, while 1920 shows all columns. (PF's `xl` is 1200px,
 * i.e. already active at 1280, so it would not help there.) Pass it to the column's `Th` and every `Td`.
 */
export const LOW_PRIORITY_COLUMN: ThProps['visibility'] = ['hidden', 'visibleOn2Xl'];
