import { adminSourceReason, adminSourceText } from './adminSource';

describe('adminSourceText (T-0115, POL-4)', () => {
  it('maps the structured sources to user language', () => {
    expect(adminSourceText({ kind: 'userList', group: null })).toBe('Admin set in the deployment settings');
    expect(adminSourceText({ kind: 'group', group: 'fleetconsole-admins' })).toBe(
      'Admin through group fleetconsole-admins',
    );
    expect(adminSourceText(null)).toBe('Admin');
  });

  it('completes "… is an administrator" for the Promote dialog', () => {
    expect(adminSourceReason({ kind: 'group', group: 'sre' })).toBe('through group sre');
    expect(adminSourceReason({ kind: 'userList', group: null })).toBe('set in the deployment settings');
    expect(adminSourceReason(null)).toBe('set in the deployment settings');
  });
});
