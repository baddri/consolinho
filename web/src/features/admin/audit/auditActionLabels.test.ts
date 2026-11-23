import { auditActionLabel, auditEntryLabel } from './auditActionLabels';

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

  it('falls back to the raw id for unknown actions', () => {
    expect(auditActionLabel('proxy.update')).toBe('proxy.update');
    expect(auditActionLabel('constructor')).toBe('constructor');
  });
});

/** Proxy `details` as the backend writes them (only the fields the label reads matter). */
const target = (group: string, resource: string, subresource: string | null = null) => ({
  method: 'PATCH',
  path: '/irrelevant',
  group,
  version: 'v1',
  resource,
  subresource,
  namespace: 'shop',
  name: 'web',
  statusCode: 200,
  outcome: 'allowed',
});

describe('auditEntryLabel (POL-3)', () => {
  it.each([
    ['scale (patch)', 'proxy.patch', target('apps', 'deployments', 'scale'), 'Scale Deployment'],
    ['scale (update)', 'proxy.update', target('apps', 'statefulsets', 'scale'), 'Scale StatefulSet'],
    ['exec', 'proxy.connect', target('', 'pods', 'exec'), 'Exec into Pod'],
    ['attach', 'proxy.connect', target('', 'pods', 'attach'), 'Attach to Pod'],
    ['eviction', 'proxy.create', target('', 'pods', 'eviction'), 'Evict Pod'],
    [
      'DC instantiate',
      'proxy.create',
      target('apps.openshift.io', 'deploymentconfigs', 'instantiate'),
      'Start rollout of DeploymentConfig',
    ],
    [
      'DC rollback',
      'proxy.create',
      target('apps.openshift.io', 'deploymentconfigs', 'rollback'),
      'Roll back DeploymentConfig',
    ],
    ['status', 'proxy.update', target('batch', 'jobs', 'status'), 'Update Job status'],
    ['Job create', 'proxy.create', target('batch', 'jobs'), 'Create Job'],
    ['Pod delete', 'proxy.delete', target('', 'pods'), 'Delete Pod'],
    ['ConfigMap update', 'proxy.update', target('', 'configmaps'), 'Update ConfigMap'],
    ['Deployment patch (restart)', 'proxy.patch', target('apps', 'deployments'), 'Patch Deployment'],
    ['collection delete', 'proxy.delete_collection', target('', 'pods'), 'Delete Pod collection'],
    ['portforward', 'proxy.connect', target('', 'pods', 'portforward'), 'Connect to Pod'],
    ['unknown CRD plural', 'proxy.create', target('example.com', 'widgets'), 'Create Widget'],
    ['unknown CRD plural in -ies', 'proxy.delete', target('example.com', 'policies'), 'Delete Policy'],
    ['same plural in another group', 'proxy.create', target('example.com', 'deployments'), 'Create Deployment'],
  ])('%s → "%s"', (_case, action, details, label) => {
    expect(auditEntryLabel({ action, details })).toBe(label);
  });

  it.each([
    ['missing details', 'proxy.update', null],
    ['malformed details', 'proxy.update', { resource: 42 }],
    ['scalar details', 'proxy.patch', 'oops'],
    ['an unlabelled verb', 'proxy.other', target('', 'pods')],
  ])('falls back to the raw id on %s', (_case, action, details) => {
    expect(auditEntryLabel({ action, details })).toBe(action);
  });

  it('labels non-proxy actions from the existing map', () => {
    expect(auditEntryLabel({ action: 'auth.login', details: null })).toBe('Logged in');
  });
});
