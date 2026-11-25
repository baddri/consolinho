import { describe, expect, it } from 'vitest';
import { clusterHealthAnswer, FAKE_OPENSHIFT_VERSION, wantsTable } from './fakeClusterHealth';

const TABLE = 'application/json;as=Table;v=v1;g=meta.k8s.io, application/json';

interface TableBody {
  kind: string;
  columnDefinitions: { name: string }[];
  rows: { cells: unknown[]; object?: unknown }[];
}

/** The cells of column `name` in a Table answer, located by name like the Api does (contract §3). */
function column(body: unknown, name: string): unknown[] {
  const table = body as TableBody;
  const index = table.columnDefinitions.findIndex((definition) => definition.name === name);
  expect(index).toBeGreaterThanOrEqual(0);
  return table.rows.map((row) => row.cells[index]);
}

describe('fake cluster health (e2e fake API server)', () => {
  it('recognises a Table Accept header', () => {
    expect(wantsTable(TABLE)).toBe(true);
    expect(wantsTable('application/json')).toBe(false);
    expect(wantsTable(undefined)).toBe(false);
  });

  it('answers nodes as a Table without objects when asked, else as a NodeList', () => {
    const asTable = clusterHealthAnswer('/api/v1/nodes', TABLE)?.body as TableBody;
    expect(asTable.kind).toBe('Table');
    expect(column(asTable, 'Status')).toEqual(['Ready', 'Ready', 'Ready']);
    expect(asTable.rows.every((row) => row.object === undefined)).toBe(true);

    expect(clusterHealthAnswer('/api/v1/nodes', 'application/json')?.body).toMatchObject({
      kind: 'NodeList',
    });
  });

  it('answers cluster operators with Available, Progressing and Degraded columns', () => {
    const body = clusterHealthAnswer('/apis/config.openshift.io/v1/clusteroperators', TABLE)?.body;
    expect(column(body, 'Available')).toEqual(['True', 'True', 'True']);
    expect(column(body, 'Progressing')).toEqual(['False', 'False', 'False']);
    expect(column(body, 'Degraded')).toEqual(['False', 'False', 'False']);
    expect(
      clusterHealthAnswer('/apis/config.openshift.io/v1/clusteroperators', 'application/json')?.body,
    ).toMatchObject({ kind: 'ClusterOperatorList' });
  });

  it('answers the ClusterVersion and /version as JSON, and nothing else', () => {
    expect(
      clusterHealthAnswer('/apis/config.openshift.io/v1/clusterversions/version', 'application/json')?.body,
    ).toMatchObject({ kind: 'ClusterVersion', status: { desired: { version: FAKE_OPENSHIFT_VERSION } } });
    expect(clusterHealthAnswer('/version', 'application/json')?.body).toMatchObject({
      gitVersion: 'v1.31.4',
    });
    expect(clusterHealthAnswer('/api/v1/pods', TABLE)).toBeUndefined();
  });
});
