import { credentialFixtures, type MockCredential } from '../fixtures';
import { credentialAllows, isAllowed, profileOf } from './rbac';

/** The RBAC profiles of the mock clusters (T-0070; `namespaced` T-0381). */

function credential(ref: string): MockCredential {
  const [clusterName, name] = ref.split('/');
  const found = credentialFixtures.find((c) => c.clusterName === clusterName && c.name === name);
  if (!found) throw new Error(`no fixture credential ${ref}`);
  return found;
}

const teamA = credential('dev-k8s-ns/team-a-editor');

describe('mock RBAC profiles', () => {
  it('derives the profile from the credential name', () => {
    expect(profileOf(teamA)).toBe('namespaced');
    expect(profileOf(credential('staging-eu-1/fleet-admin'))).toBe('admin');
    expect(profileOf(credential('dev-1/fleet-edit'))).toBe('edit');
    expect(profileOf(credential('prod-eu-1/fleet-view'))).toBe('view');
  });

  it.each([
    ['list', 'pods', 'team-a', true],
    ['create', 'pods', 'team-a', true],
    ['delete', 'deployments', 'team-a', true],
    ['patch', 'deployments/scale', 'team-a', true],
    ['get', 'pods/log', 'team-a', true],
    ['create', 'pods/exec', 'team-a', true],
    ['list', 'pods', 'shop', false],
    ['get', 'configmaps', 'default', false],
    ['list', 'pods', undefined, false],
    ['list', 'namespaces', undefined, false],
    ['get', 'namespaces', 'team-a', false],
    ['list', 'nodes', undefined, false],
    ['list', 'projects', undefined, false],
  ])('namespaced: %s %s in %s → %s', (verb, resource, namespace, allowed) => {
    expect(credentialAllows(teamA, verb, resource, namespace)).toBe(allowed);
  });

  const BY_PROFILE = {
    view: 'prod-eu-1/fleet-view',
    edit: 'dev-1/fleet-edit',
    admin: 'staging-eu-1/fleet-admin',
  } as const;

  it.each([
    ['view', 'list', 'namespaces', true],
    ['view', 'patch', 'deployments', false],
    ['edit', 'create', 'pods', true],
    ['edit', 'create', 'namespaces', false],
    ['admin', 'delete', 'nodes', true],
  ] as const)('%s: %s %s → %s, whatever the namespace', (profile, verb, resource, allowed) => {
    expect(isAllowed(profile, verb, resource)).toBe(allowed);
    for (const namespace of [undefined, 'shop', 'team-a']) {
      expect(credentialAllows(credential(BY_PROFILE[profile]), verb, resource, namespace)).toBe(allowed);
    }
  });
});
