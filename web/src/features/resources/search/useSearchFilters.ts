import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useDebouncedCallback } from 'use-debounce';

/** How long the name input waits before it writes `?name=` (OCP `search.tsx`: 300 ms). */
const NAME_DEBOUNCE_MS = 300;

/** Splits a comma-separated URL parameter, dropping empty entries. */
function splitParam(value: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/** URL-backed filter state of the Search page. */
export interface SearchFilters {
  /** `?kind=` — selected kind references, in selection order (unknown ones included). */
  kinds: string[];
  /** `?q=` — label requirements (`key=value`), ANDed. */
  labels: string[];
  /** The name input as typed (ahead of the debounced URL). */
  nameInput: string;
  /** `?name=` — the applied (debounced) name substring. */
  name: string;
  toggleKind: (ref: string) => void;
  clearKinds: () => void;
  /** Adds a label requirement (no-op when already present). */
  addLabel: (label: string) => void;
  removeLabel: (label: string) => void;
  clearLabels: () => void;
  /** Updates the input now and `?name=` after 300 ms. */
  setNameInput: (value: string) => void;
  clearName: () => void;
  clearAll: () => void;
}

/**
 * Filter state of the Search page in OCP's URL parameters (SRCH-3, OCP `search.tsx`): `?kind=<ref>,<ref>`,
 * `?q=<k=v>,<k=v>` and `?name=`, so a search survives reload and cluster switches. Writes replace the history entry,
 * like OCP's `setQueryArgument`; empty values remove their parameter.
 */
export function useSearchFilters(): SearchFilters {
  const [params, setParams] = useSearchParams();
  const kindParam = params.get('kind');
  const qParam = params.get('q');
  const name = params.get('name') ?? '';
  const kinds = useMemo(() => [...new Set(splitParam(kindParam))], [kindParam]);
  const labels = useMemo(() => [...new Set(splitParam(qParam))], [qParam]);

  // The input runs ahead of the URL while typing; it follows the URL when `?name=` changes from elsewhere
  // (back/forward, "Clear all filters", a pasted link).
  const [nameInput, setNameInputState] = useState(name);
  const [syncedName, setSyncedName] = useState(name);
  if (syncedName !== name) {
    setSyncedName(name);
    setNameInputState(name);
  }

  const update = useCallback(
    (changes: Record<string, string>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const writeName = useDebouncedCallback((value: string) => update({ name: value.trim() }), NAME_DEBOUNCE_MS);

  const setNameInput = useCallback(
    (value: string) => {
      setNameInputState(value);
      writeName(value);
    },
    [writeName],
  );

  const clearName = useCallback(() => {
    writeName.cancel();
    setNameInputState('');
    update({ name: '' });
  }, [update, writeName]);

  return {
    kinds,
    labels,
    nameInput,
    name,
    toggleKind: (ref) =>
      update({ kind: (kinds.includes(ref) ? kinds.filter((k) => k !== ref) : [...kinds, ref]).join(',') }),
    clearKinds: () => update({ kind: '' }),
    addLabel: (label) => {
      if (!labels.includes(label)) update({ q: [...labels, label].join(',') });
    },
    removeLabel: (label) => update({ q: labels.filter((l) => l !== label).join(',') }),
    clearLabels: () => update({ q: '' }),
    setNameInput,
    clearName,
    clearAll: () => {
      writeName.cancel();
      setNameInputState('');
      update({ kind: '', q: '', name: '' });
    },
  };
}
