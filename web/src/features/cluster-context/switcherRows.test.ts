import type { AccessibleCluster } from '@/shared/api';
import {
  buildSwitcherSections,
  FLEET_ITEM_ID,
  focusOrder,
  matchingClusters,
  nextFocusKey,
  RETRY_ITEM_ID,
  type SwitcherSectionsInput,
} from './switcherRows';

const cluster = (name: string, environment: AccessibleCluster['environment'] = 'development'): AccessibleCluster => ({
  name,
  displayName: name,
  environment,
  distribution: 'openShift',
  accessMode: 'readWrite',
  webConsoleUrl: null,
});

const a = cluster('dev-a');
const b = cluster('prod-b', 'production');
const c = cluster('stage-c', 'staging');

const input = (overrides: Partial<SwitcherSectionsInput> = {}): SwitcherSectionsInput => ({
  clusters: [a, b, c],
  hasError: false,
  recent: [b, a],
  shownName: 'dev-a',
  searchText: '',
  ...overrides,
});

describe('buildSwitcherSections', () => {
  it('orders the sections fleet → recent → all, labelling the groups only when Recent is shown', () => {
    const sections = buildSwitcherSections(input());
    expect(sections.map((section) => [section.id, section.groupLabel])).toEqual([
      ['fleet', undefined],
      ['recent', 'Recent'],
      ['all', 'All clusters'],
    ]);
    expect(buildSwitcherSections(input({ recent: [] })).map((s) => [s.id, s.groupLabel])).toEqual([
      ['fleet', undefined],
      ['all', undefined],
    ]);
  });

  it('gives a cluster listed in Recent and All clusters a distinct key per section', () => {
    const keys = focusOrder(buildSwitcherSections(input())).map((row) => row.key);
    expect(keys).toEqual(['fleet:management', 'recent:prod-b', 'recent:dev-a', 'all:dev-a', 'all:prod-b', 'all:stage-c']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('filters All clusters and hides Recent while searching; Fleet stays', () => {
    const sections = buildSwitcherSections(input({ searchText: ' PROD ' }));
    expect(sections.map((section) => section.id)).toEqual(['fleet', 'all']);
    expect(matchingClusters(sections)).toEqual([b]);
  });

  it('keeps status rows out of the focus order', () => {
    const sections = buildSwitcherSections(input({ searchText: 'zzz' }));
    expect(sections[1]?.rows).toEqual([{ kind: 'status', key: 'all:status', text: 'No clusters match "zzz"' }]);
    expect(focusOrder(sections)).toEqual([expect.objectContaining({ itemId: FLEET_ITEM_ID })]);
    expect(focusOrder(buildSwitcherSections(input({ clusters: undefined })))).toEqual([
      expect.objectContaining({ itemId: FLEET_ITEM_ID }),
    ]);
  });

  it('offers the retry row after a failed load', () => {
    const order = focusOrder(buildSwitcherSections(input({ clusters: undefined, hasError: true })));
    expect(order.map((row) => row.itemId)).toEqual([FLEET_ITEM_ID, RETRY_ITEM_ID]);
  });
});

describe('nextFocusKey', () => {
  const order = focusOrder(buildSwitcherSections(input({ recent: [] })));
  const keys = order.map((row) => row.key);
  /** The key at `index` (negative counts from the end). */
  const key = (index: number) => keys.at(index) ?? null;

  it('starts at the first row going down and the last going up', () => {
    expect(nextFocusKey(order, null, 'ArrowDown')).toBe(key(0));
    expect(nextFocusKey(order, null, 'ArrowUp')).toBe(key(-1));
    expect(nextFocusKey(order, 'gone:key', 'ArrowDown')).toBe(key(0));
  });

  it('steps and wraps at both ends', () => {
    expect(nextFocusKey(order, key(0), 'ArrowDown')).toBe(key(1));
    expect(nextFocusKey(order, key(1), 'ArrowUp')).toBe(key(0));
    expect(nextFocusKey(order, key(-1), 'ArrowDown')).toBe(key(0));
    expect(nextFocusKey(order, key(0), 'ArrowUp')).toBe(key(-1));
  });

  it('returns null when nothing is focusable', () => {
    expect(nextFocusKey([], null, 'ArrowDown')).toBeNull();
    expect(nextFocusKey([], 'all:dev-a', 'ArrowUp')).toBeNull();
  });
});
