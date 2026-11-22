import {
  eventKindKey,
  filterEvents,
  latestEvents,
  MAX_EVENTS,
  NO_EVENT_FILTERS,
  sortEvents,
  type EventResource,
} from './eventStream';

function event(
  name: string,
  overrides: Partial<EventResource> & { objectKind?: string; objectApiVersion?: string; objectName?: string } = {},
): EventResource {
  const { objectKind = 'Pod', objectApiVersion = 'v1', objectName = name, ...rest } = overrides;
  return {
    apiVersion: 'v1',
    kind: 'Event',
    metadata: { name, namespace: 'shop', uid: name },
    involvedObject: { kind: objectKind, apiVersion: objectApiVersion, name: objectName, namespace: 'shop' },
    ...rest,
  };
}

describe('sortEvents (OCP sortEvents)', () => {
  it('orders newest last time first, then first time, then name', () => {
    const events = [
      event('b', { lastTimestamp: '2026-11-22T10:00:00Z', firstTimestamp: '2026-11-22T09:00:00Z' }),
      event('a', { lastTimestamp: '2026-11-22T10:00:00Z', firstTimestamp: '2026-11-22T09:00:00Z' }),
      event('series', { series: { count: 3, lastObservedTime: '2026-11-22T11:00:00Z' } }),
      event('newer-first', { lastTimestamp: '2026-11-22T10:00:00Z', firstTimestamp: '2026-11-22T09:30:00Z' }),
    ];

    expect(sortEvents(events).map((e) => e.metadata.name)).toEqual(['series', 'newer-first', 'a', 'b']);
  });
});

describe('filterEvents (OCP filterEvents)', () => {
  const events = [
    event('started', { type: 'Normal', message: 'Started container web', objectName: 'web-1' }),
    event('backoff', { type: 'Warning', message: 'Back-off restarting', objectName: 'web-2' }),
    event('scaled', {
      objectKind: 'Deployment',
      objectApiVersion: 'apps/v1',
      message: 'Scaled up replica set',
      objectName: 'web',
    }),
  ];
  const names = (filtered: readonly EventResource[]) => filtered.map((e) => e.metadata.name);

  it('returns the list itself without filters', () => {
    expect(filterEvents(events, NO_EVENT_FILTERS)).toBe(events);
  });

  it('filters by type; a missing type counts as Normal', () => {
    expect(names(filterEvents(events, { ...NO_EVENT_FILTERS, type: 'normal' }))).toEqual(['started', 'scaled']);
    expect(names(filterEvents(events, { ...NO_EVENT_FILTERS, type: 'warning' }))).toEqual(['backoff']);
  });

  it('filters by kind and group, not version', () => {
    const kinds = [eventKindKey('apps/v1beta1', 'Deployment')];
    expect(names(filterEvents(events, { ...NO_EVENT_FILTERS, kinds }))).toEqual(['scaled']);
  });

  it('needs every word in the object name or the message, case-insensitive in the message', () => {
    expect(names(filterEvents(events, { ...NO_EVENT_FILTERS, text: 'web-2' }))).toEqual(['backoff']);
    expect(names(filterEvents(events, { ...NO_EVENT_FILTERS, text: 'STARTED web' }))).toEqual(['started']);
    expect(names(filterEvents(events, { ...NO_EVENT_FILTERS, text: 'started nothing' }))).toEqual([]);
  });
});

describe('latestEvents (OCP maxMessages)', () => {
  it(`keeps only the newest ${MAX_EVENTS}, newest first`, () => {
    const start = Date.parse('2026-11-22T00:00:00Z');
    // Oldest first in the input, one second apart.
    const events = Array.from({ length: MAX_EVENTS + 20 }, (_, i) =>
      event(`e${i}`, { lastTimestamp: new Date(start + i * 1000).toISOString() }),
    );

    const latest = latestEvents(events);

    expect(latest).toHaveLength(MAX_EVENTS);
    expect(latest[0]?.metadata.name).toBe(`e${MAX_EVENTS + 19}`);
    expect(latest.at(-1)?.metadata.name).toBe('e20');
    // Same order again from the cached sort keys.
    expect(latestEvents(events)).toEqual(latest);
  });
});
