import { auditActionLabel } from './auditActionLabels';

describe('auditActionLabel', () => {
  it.each([
    ['auth.login_denied', 'Login denied'],
    ['cluster.registered', 'Cluster registered'],
    ['credential.rotated', 'Credential rotated'],
    ['grant.revoked', 'Access revoked'],
    ['user.read_only_changed', 'Read only changed'],
  ])('labels %s as "%s"', (action, label) => {
    expect(auditActionLabel(action)).toBe(label);
  });

  it('falls back to the raw id for unknown actions such as proxied mutations', () => {
    expect(auditActionLabel('proxy.update')).toBe('proxy.update');
    expect(auditActionLabel('constructor')).toBe('constructor');
  });
});
