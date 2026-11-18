import { apiClient, ApiError, unwrap } from '@/shared/api';
import type { AuditCategory } from '@/shared/api';
import { AUDIT_FIXTURE_COUNT, mockDb } from '@/test/handlers';

type AuditQuery = Partial<{
  actor: string;
  user: string;
  category: AuditCategory;
  cluster: string;
  target: string;
  from: string;
  to: string;
  cursor: string;
  limit: number;
}>;

const audit = (query: AuditQuery = {}) => unwrap(apiClient.GET('/api/admin/audit', { params: { query } }));

describe('mock audit API (contract §10)', () => {
  it('has ≥ 120 generated entries covering every category', () => {
    expect(AUDIT_FIXTURE_COUNT).toBeGreaterThanOrEqual(120);
    const categories = new Set(mockDb.audit.map((entry) => entry.category));
    expect([...categories].sort()).toEqual(['auth', 'clusters', 'credentials', 'grants', 'users']);
  });

  it('pages newest first with an opaque cursor: two pages, no duplicates, then the end', async () => {
    const first = await audit({ limit: 50 });
    const second = await audit({ limit: 50, cursor: first.nextCursor ?? '' });
    const rest = await audit({ limit: 200, cursor: second.nextCursor ?? '' });

    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(50);
    const ids = [...first.items, ...second.items, ...rest.items].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(AUDIT_FIXTURE_COUNT);
    expect(rest.nextCursor).toBeNull();
    const times = [...first.items, ...second.items].map((entry) => Date.parse(entry.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('keeps the next page stable when new entries arrive', async () => {
    const first = await audit({ limit: 10 });
    await unwrap(apiClient.POST('/api/admin/users', { body: { username: 'newcomer' } }));

    const second = await audit({ limit: 10, cursor: first.nextCursor ?? '' });

    expect(second.items[0]?.id).toBe(mockDb.audit[11]?.id);
  });

  it('defaults to 50 entries per page', async () => {
    expect((await audit()).items).toHaveLength(50);
  });

  it('filters by category and cluster (AND)', async () => {
    const page = await audit({ category: 'grants', cluster: 'prod-eu-1', limit: 200 });

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((e) => e.category === 'grants' && e.clusterName === 'prod-eu-1')).toBe(true);
    const expected = mockDb.audit.filter((e) => e.category === 'grants' && e.clusterName === 'prod-eu-1');
    expect(page.items).toHaveLength(expected.length);
  });

  it('filters by user (actor or target), target substring and time range', async () => {
    const byUser = await audit({ user: 'dave', limit: 200 });
    const byTarget = await audit({ target: 'PROD-EU', limit: 200 });
    const middle = mockDb.audit[60]?.occurredAt ?? '';
    const older = await audit({ to: middle, limit: 200 });

    expect(byUser.items.length).toBeGreaterThan(0);
    expect(
      byUser.items.every(
        (e) => e.actor === 'dave' || e.targetName === 'dave' || e.targetName.startsWith('dave → '),
      ),
    ).toBe(true);
    expect(byTarget.items.every((e) => e.targetName.toLowerCase().includes('prod-eu'))).toBe(true);
    expect(older.items).toHaveLength(AUDIT_FIXTURE_COUNT - 61);
  });

  it('rejects invalid parameters with field errors keyed by parameter', async () => {
    const error: unknown = await audit({ limit: 500, cursor: 'bm90LWFuLWlk' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fieldErrors).toEqual({
      limit: ['Limit must be between 1 and 200.'],
      cursor: ['The cursor is invalid. Reload the audit log.'],
    });
  });
});
