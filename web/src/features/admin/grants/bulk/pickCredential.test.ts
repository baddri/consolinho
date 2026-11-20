import { pickCredential } from './pickCredential';

const view = { id: 'c-view', name: 'fleet-view' };
const edit = { id: 'c-edit', name: 'fleet-edit' };

describe('pickCredential (GRANT-4)', () => {
  it('picks the only credential, whatever the preferred name', () => {
    expect(pickCredential([edit], '')).toBe('c-edit');
    expect(pickCredential([edit], 'fleet-view')).toBe('c-edit');
  });

  it('picks the credential named like the preferred name among several', () => {
    expect(pickCredential([edit, view], 'fleet-view')).toBe('c-view');
    expect(pickCredential([edit, view], '  fleet-view ')).toBe('c-view');
  });

  it('picks nothing among several without a (matching) preferred name', () => {
    expect(pickCredential([edit, view], '')).toBeUndefined();
    expect(pickCredential([edit, view], 'fleet-admin')).toBeUndefined();
    expect(pickCredential([edit, view], 'FLEET-VIEW')).toBeUndefined();
  });

  it('picks nothing without credentials', () => {
    expect(pickCredential([], 'fleet-view')).toBeUndefined();
  });
});
