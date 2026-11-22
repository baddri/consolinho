import type { Event, K8sResource } from '@/shared/k8s';

/** A listed core/v1 event (`metadata` always present). */
export type EventResource = Event & K8sResource;

/** OCP `maxMessages`: the stream keeps the most recent 500 events and says "Showing most recent 500 events". */
export const MAX_EVENTS = 500;

/** Event type filter of the Events page toolbar ("All types" select). */
export type EventTypeFilter = 'all' | 'normal' | 'warning';

/** The Events page's client-side filters (OCP `filterEvents`). */
export interface EventFilters {
  type: EventTypeFilter;
  /** {@link eventKindKey}s of the "Resources" select; empty = every kind. */
  kinds: readonly string[];
  /** "Filter Events by name or message" text. */
  text: string;
}

/** No filter at all (the Events tab). */
export const NO_EVENT_FILTERS: EventFilters = { type: 'all', kinds: [], text: '' };

/** First occurrence: `firstTimestamp` (core/v1), else `eventTime` (events.k8s.io), as OCP `getFirstTime`. */
export function eventFirstTime(event: Event): string | undefined {
  return event.firstTimestamp ?? event.eventTime;
}

/** Last occurrence (OCP `getLastTime`): `lastTimestamp`, else the series' last observation, else `eventTime`. */
export function eventLastTime(event: Event): string | undefined {
  return event.lastTimestamp ?? event.series?.lastObservedTime ?? event.eventTime;
}

/** How often the event happened: the series count (events.k8s.io) or `count` (core/v1). */
export function eventCount(event: Event): number {
  return event.series?.count ?? event.count ?? 1;
}

/** Whether the event is a Warning (anything without a type counts as Normal, as OCP `typeFilter`). */
export function isWarningEvent(event: Event): boolean {
  return (event.type ?? 'normal').toLowerCase() === 'warning';
}

/** API group of an `apiVersion` (`apps/v1` → `apps`, `v1` → core `''`). */
function apiGroup(apiVersion: string | undefined): string {
  const slash = apiVersion?.indexOf('/') ?? -1;
  return slash === -1 || apiVersion === undefined ? '' : apiVersion.slice(0, slash);
}

/**
 * Key of a kind in the "Resources" select: `<group>~<kind>` (OCP matches group and kind, not the version, so events of
 * an object under another API version still match).
 */
export function eventKindKey(apiVersion: string | undefined, kind: string): string {
  return `${apiGroup(apiVersion)}~${kind}`;
}

function time(value: string | undefined): number {
  return value ? Date.parse(value) || 0 : 0;
}

interface SortKey {
  last: number;
  first: number;
  name: string;
}

/**
 * Parsed sort keys per event object. The watch cache keeps an unchanged event's identity between flushes (a changed
 * one is a new object), so each event's dates are parsed once, not on every comparison of every 100 ms flush.
 */
const sortKeys = new WeakMap<EventResource, SortKey>();

function sortKey(event: EventResource): SortKey {
  let key = sortKeys.get(event);
  if (!key) {
    key = {
      last: time(eventLastTime(event)),
      first: time(eventFirstTime(event)),
      name: event.metadata.name ?? '',
    };
    sortKeys.set(event, key);
  }
  return key;
}

/** Newest first, by last then first time, then name ascending (OCP `sortEvents`). Doesn't mutate `events`. */
export function sortEvents<T extends EventResource>(events: readonly T[]): T[] {
  return events
    .map((event) => ({ event, key: sortKey(event) }))
    .sort(
      (a, b) =>
        b.key.last - a.key.last || b.key.first - a.key.first || a.key.name.localeCompare(b.key.name),
    )
    .map(({ event }) => event);
}

/** The stream's events: the newest {@link MAX_EVENTS} of `events`, newest first (OCP `EventStream`'s `sortedEvents`). */
export function latestEvents<T extends EventResource>(events: readonly T[]): T[] {
  return sortEvents(events).slice(0, MAX_EVENTS);
}

/**
 * The events matching `filters` (OCP `filterEvents`): the type, one of the selected kinds, and every word of the text
 * as an exact substring of the involved object's name or the lower-cased message (no fuzzy matching: it surprises in
 * long messages).
 */
export function filterEvents<T extends EventResource>(events: readonly T[], filters: EventFilters): readonly T[] {
  const words = [...new Set(filters.text.toLowerCase().match(/\S+/g) ?? [])];
  const kinds = new Set(filters.kinds);
  if (filters.type === 'all' && kinds.size === 0 && words.length === 0) return events;
  return events.filter((event) => {
    if (filters.type !== 'all' && isWarningEvent(event) !== (filters.type === 'warning')) return false;
    const { apiVersion, kind = '', name = '' } = event.involvedObject;
    if (kinds.size > 0 && !kinds.has(eventKindKey(apiVersion, kind))) return false;
    const message = (event.message ?? '').toLowerCase();
    return words.every((word) => name.includes(word) || message.includes(word));
  });
}
