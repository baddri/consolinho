import { MenuToggle, Select, SelectList, SelectOption, ToolbarFilter, ToolbarItem } from '@patternfly/react-core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterToolbar, SingleSelectFilter } from '@/shared/table';
import { useClusters } from '../clusters/api';
import { useUsers } from '../users/api';
import { CATEGORY_OPTIONS, effectiveRange, SYSTEM_ACTOR, type AuditFiltersState } from './auditFilters';
import { DateTimeField } from './DateTimeField';
import { TIME_RANGE_LABELS, TIME_RANGES, type TimeRange } from './timeRange';
import { TypeaheadFilter } from './TypeaheadFilter';

/** Debounce of the target search box (spec: 300 ms). */
const TARGET_DEBOUNCE_MS = 300;

/**
 * Local text of a debounced URL filter: edits apply after `delayMs` of quiet; a URL change from elsewhere ("Clear all
 * filters", back navigation) replaces the local text. `commit` must be stable (`useCallback`).
 */
function useDebouncedText(value: string, commit: (value: string) => void, delayMs: number) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }
  useEffect(() => {
    if (text === value) return undefined;
    const timer = setTimeout(() => commit(text), delayMs);
    return () => clearTimeout(timer);
  }, [text, value, commit, delayMs]);
  return [text, setText] as const;
}

/** Props for {@link AuditFilters}. */
export interface AuditFiltersProps {
  /** URL filter state from `useAuditFilters`. */
  filters: AuditFiltersState;
}

/**
 * Toolbar of `/admin/audit` (AUD-4): actor and cluster typeaheads (suggestions from the admin users/clusters lists,
 * free text allowed), category select, debounced target search, time range presets with a custom from/to, and a
 * removable "User" label for the user detail page's `?user=` deep link (USR-7). Every filter lives in the URL.
 */
export function AuditFilters({ filters }: AuditFiltersProps) {
  const { values, setText, setSingle, clearAll, setTimeRange } = filters;
  const users = useUsers();
  const clusters = useClusters();

  const actorOptions = useMemo(
    () => [...(users.data ?? []).map((user) => user.username), SYSTEM_ACTOR],
    [users.data],
  );
  const clusterOptions = useMemo(() => (clusters.data ?? []).map((cluster) => cluster.name), [clusters.data]);

  const commitTarget = useCallback((value: string) => setText('target', value), [setText]);
  const [target, setTarget] = useDebouncedText(values.target ?? '', commitTarget, TARGET_DEBOUNCE_MS);

  return (
    <FilterToolbar
      ariaLabel="Audit log toolbar"
      search={{
        value: target,
        onChange: setTarget,
        placeholder: 'Filter by target name',
        ariaLabel: 'Search targets',
      }}
      filterItems={
        <>
          <TypeaheadFilter
            categoryName="Actor"
            placeholder="Actor"
            options={actorOptions}
            value={values.actor}
            onChange={(value) => setText('actor', value ?? '')}
          />
          {values.user && (
            <ToolbarFilter
              categoryName="User"
              labels={[{ key: values.user, node: values.user }]}
              deleteLabel={() => setText('user', '')}
              deleteLabelGroup={() => setText('user', '')}
              showToolbarItem={false}
            >
              {null}
            </ToolbarFilter>
          )}
          <SingleSelectFilter
            categoryName="Category"
            options={CATEGORY_OPTIONS}
            value={values.category}
            onChange={(value) => setSingle('category', value)}
          />
          <TypeaheadFilter
            categoryName="Cluster"
            placeholder="Cluster"
            options={clusterOptions}
            value={values.cluster}
            onChange={(value) => setText('cluster', value ?? '')}
          />
          <TimeRangeFilter
            range={effectiveRange(values)}
            onChange={setTimeRange}
          />
          {effectiveRange(values) === 'custom' && (
            <>
              <ToolbarItem>
                <DateTimeField label="From" value={values.from} onChange={(value) => setText('from', value ?? '')} />
              </ToolbarItem>
              <ToolbarItem>
                <DateTimeField label="To" value={values.to} onChange={(value) => setText('to', value ?? '')} />
              </ToolbarItem>
            </>
          )}
        </>
      }
      onClearAll={clearAll}
    />
  );
}

/** Props for {@link TimeRangeFilter}. */
interface TimeRangeFilterProps {
  range?: TimeRange;
  onChange: (range?: TimeRange) => void;
}

/** "Time" select with the presets and "Custom range"; its label removes the whole time filter. */
function TimeRangeFilter({ range, onChange }: TimeRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ToolbarFilter
      categoryName="Time"
      labels={range ? [{ key: range, node: TIME_RANGE_LABELS[range] }] : []}
      deleteLabel={() => onChange(undefined)}
      deleteLabelGroup={() => onChange(undefined)}
    >
      <Select
        isOpen={isOpen}
        selected={range}
        onSelect={(_event, selected) => {
          const next = TIME_RANGES.find((candidate) => candidate === selected);
          onChange(next === range ? undefined : next);
          setIsOpen(false);
        }}
        onOpenChange={setIsOpen}
        toggle={(toggleRef) => (
          <MenuToggle
            ref={toggleRef}
            aria-label="Filter by Time"
            isExpanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            {range ? TIME_RANGE_LABELS[range] : 'All time'}
          </MenuToggle>
        )}
      >
        <SelectList>
          {TIME_RANGES.map((option) => (
            <SelectOption key={option} value={option}>
              {TIME_RANGE_LABELS[option]}
            </SelectOption>
          ))}
        </SelectList>
      </Select>
    </ToolbarFilter>
  );
}
