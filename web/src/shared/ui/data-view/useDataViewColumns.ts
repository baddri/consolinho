import { useCallback, useMemo } from 'react';
import { useStoredValue } from '@/shared/hooks';
import type { DataViewColumn } from './types';

/** `localStorage` prefixes; the list id follows (OCP keeps the same choices in its user settings, per table id). */
const COLUMNS_KEY = 'fleetconsole.dataView.columns.';
const WIDTHS_KEY = 'fleetconsole.dataView.columnWidths.';

/**
 * The "Manage columns" choice: shown ids in display order, and ids explicitly hidden. Columns in neither list (e.g. the
 * Namespace column while one project is listed, or one added later) keep their default visibility.
 */
export interface ColumnChoice {
  shown: string[];
  hidden: string[];
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string');

function parseChoice(raw: string): ColumnChoice | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return undefined;
    const { shown, hidden } = value as Partial<Record<keyof ColumnChoice, unknown>>;
    return isStringArray(shown) && isStringArray(hidden) ? { shown, hidden } : undefined;
  } catch {
    return undefined;
  }
}

function parseWidths(raw: string): Record<string, number> | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
    );
  } catch {
    return undefined;
  }
}

const serialize = (value: unknown) => JSON.stringify(value);

/** Whether a column is shown by default (not an additional column). */
export const isDefaultColumn = <T>(column: DataViewColumn<T>) => column.defaultVisible !== false;

/** What {@link useDataViewColumns} returns. */
export interface DataViewColumnsState<T> {
  /** Columns to render, in order: name columns first, then the stored order, then unmentioned default columns. */
  shown: DataViewColumn<T>[];
  /** Every column in "Manage columns" order (shown ones first) with whether it is shown. */
  managed: { column: DataViewColumn<T>; isShown: boolean }[];
  /** Stores the columns picked (and ordered) in "Manage columns"; choices for columns not listed now are kept. */
  setColumnChoice: (choice: ColumnChoice) => void;
  /** Stored widths (px) of resized columns. */
  widths: Readonly<Record<string, number>>;
  setWidth: (columnId: string, width: number) => void;
  resetWidths: () => void;
}

/**
 * Column management and column widths of one data view (OCP `useConsoleDataViewColumns` +
 * `useConsoleDataViewResizableColumns`), remembered in `localStorage` per list `id` so they survive reloads. `name`
 * columns are always shown and first; unknown stored ids are ignored, unreadable stored data means defaults.
 */
export function useDataViewColumns<T>(id: string, columns: DataViewColumn<T>[]): DataViewColumnsState<T> {
  const [choice, storeChoice] = useStoredValue(COLUMNS_KEY + id, parseChoice, serialize);
  const [storedWidths, storeWidths] = useStoredValue(WIDTHS_KEY + id, parseWidths, serialize);

  const managed = useMemo(() => {
    const byId = new Map(columns.map((column) => [column.id, column]));
    const isShown = (column: DataViewColumn<T>) =>
      column.type === 'name' ||
      (choice?.shown.includes(column.id) ?? false) ||
      (!choice?.hidden.includes(column.id) && isDefaultColumn(column));
    const ordered = [
      ...columns.filter((column) => column.type === 'name'),
      ...(choice?.shown ?? []).flatMap((columnId) => {
        const column = byId.get(columnId);
        return column && column.type !== 'name' ? [column] : [];
      }),
    ];
    const rest = columns.filter((column) => !ordered.includes(column));
    return [...ordered, ...rest.filter(isShown), ...rest.filter((column) => !isShown(column))].map(
      (column) => ({
        column,
        isShown: isShown(column),
      }),
    );
  }, [columns, choice]);
  const shown = useMemo(
    () => managed.filter((entry) => entry.isShown && !entry.column.isHidden).map((entry) => entry.column),
    [managed],
  );
  const widths = useMemo(() => storedWidths ?? {}, [storedWidths]);

  const setColumnChoice = useCallback(
    (next: ColumnChoice) => {
      const mentioned = new Set([...next.shown, ...next.hidden]);
      const keep = (ids: string[] = []) => ids.filter((columnId) => !mentioned.has(columnId));
      storeChoice({
        shown: [...next.shown, ...keep(choice?.shown)],
        hidden: [...next.hidden, ...keep(choice?.hidden)],
      });
    },
    [choice, storeChoice],
  );
  const setWidth = useCallback(
    (columnId: string, width: number) => storeWidths({ ...widths, [columnId]: Math.round(width) }),
    [storeWidths, widths],
  );
  const resetWidths = useCallback(() => storeWidths({}), [storeWidths]);

  return { shown, managed, setColumnChoice, widths, setWidth, resetWidths };
}
