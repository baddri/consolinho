import { adminSourceReason, adminSourceText } from './adminSource';

describe('adminSourceText (T-0115)', () => {
  it('maps the backend sources to user language', () => {
    expect(adminSourceText('user list')).toBe('Admin set in the deployment settings');
    expect(adminSourceText('group fleetconsole-admins')).toBe('Admin through group fleetconsole-admins');
    expect(adminSourceText(null)).toBe('Admin');
  });

  it('falls back to the deployment settings for an unknown source, never showing it verbatim', () => {
    expect(adminSourceText('ldap filter x')).toBe('Admin set in the deployment settings');
    expect(adminSourceReason('ldap filter x')).toBe('set in the deployment settings');
    expect(adminSourceReason('group sre')).toBe('through group sre');
  });
});
