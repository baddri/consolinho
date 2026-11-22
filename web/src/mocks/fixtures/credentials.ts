import { fingerprintOf, mockGuid } from './ids';
import type { MockCredential } from './types';
import { daysAgo, daysFromNow } from './time';

/** Fixture credential ids, for tests that address a credential directly. */
export const credentialIds = {
  prodEuView: mockGuid(0x101),
  prodEuEdit: mockGuid(0x102),
  prodUsView: mockGuid(0x103),
  prodUsLegacy: mockGuid(0x104),
  stagingAdmin: mockGuid(0x105),
  dev1Edit: mockGuid(0x106),
  dev2View: mockGuid(0x107),
  lab1Edit: mockGuid(0x108),
} as const;

/** Builds a JWT-derived credential record; `sa` is `<namespace>/<name>`. */
function jwtCredential(
  init: Pick<MockCredential, 'id' | 'clusterName' | 'name' | 'expiresAt' | 'lastTest' | 'testScenario'> &
    Partial<Pick<MockCredential, 'inspectNamespaces'>> & {
      sa: string;
      issuedDaysAgo: number;
    },
): MockCredential {
  const [namespace = '', saName = ''] = init.sa.split('/');
  return {
    id: init.id,
    clusterName: init.clusterName,
    name: init.name,
    description: null,
    inspectNamespaces: init.inspectNamespaces ?? [],
    fingerprint: fingerprintOf(`${init.clusterName}/${init.name}`),
    tokenType: 'jwt',
    serviceAccount: init.sa,
    subject: `system:serviceaccount:${namespace}:${saName}`,
    issuedAt: daysAgo(init.issuedDaysAgo),
    expiresAt: init.expiresAt,
    createdAt: daysAgo(init.issuedDaysAgo),
    createdBy: 'admin',
    rotatedAt: null,
    rotatedBy: null,
    lastTest: init.lastTest,
    testScenario: init.testScenario,
    version: 1,
  };
}

/**
 * Credentials covering every expiry status — `ok` (prod-eu-1 fleet-view, dev-2), `expiringSoon` (prod-eu-1
 * fleet-edit, 5 days), `expired` (prod-us-1 fleet-view), `unknown` (prod-us-1 legacy-token, opaque), `noExpiry`
 * (staging-eu-1) — with and without a last test: a stale one (staging-eu-1, tested before the cluster's settings
 * changed) and failed ones (prod-us-1 authentication, dev-1 TLS reachability). staging-eu-1 has a saved
 * inspect-namespaces list (`team-a`, `team-b`, NST-6). `lab-1` (Kubernetes) has one untested
 * edit credential so the K8s switcher/theme cases have a grant to show.
 */
export const credentialFixtures: readonly MockCredential[] = [
  jwtCredential({
    id: credentialIds.prodEuView,
    clusterName: 'prod-eu-1',
    name: 'fleet-view',
    sa: 'fleetconsole/fleet-view',
    issuedDaysAgo: 100,
    expiresAt: daysFromNow(265),
    lastTest: { testedAt: daysAgo(2), succeeded: true, failedStep: null, headline: 'clusterWideView' },
    testScenario: 'view',
  }),
  jwtCredential({
    id: credentialIds.prodEuEdit,
    clusterName: 'prod-eu-1',
    name: 'fleet-edit',
    sa: 'fleetconsole/fleet-edit',
    issuedDaysAgo: 85,
    expiresAt: daysFromNow(5),
    lastTest: { testedAt: daysAgo(10), succeeded: true, failedStep: null, headline: 'clusterWideEdit' },
    testScenario: 'edit',
  }),
  jwtCredential({
    id: credentialIds.prodUsView,
    clusterName: 'prod-us-1',
    name: 'fleet-view',
    sa: 'fleetconsole/fleet-view',
    issuedDaysAgo: 93,
    expiresAt: daysAgo(3),
    lastTest: { testedAt: daysAgo(1), succeeded: false, failedStep: 'authentication', headline: null },
    testScenario: 'authFailure',
  }),
  {
    id: credentialIds.prodUsLegacy,
    clusterName: 'prod-us-1',
    name: 'legacy-token',
    description: 'Opaque token from the old tooling; replace with a ServiceAccount token.',
    inspectNamespaces: [],
    fingerprint: fingerprintOf('prod-us-1/legacy-token'),
    tokenType: 'opaque',
    serviceAccount: null,
    subject: null,
    issuedAt: null,
    expiresAt: null,
    createdAt: daysAgo(90),
    createdBy: 'carol',
    rotatedAt: null,
    rotatedBy: null,
    lastTest: null,
    testScenario: 'view',
    version: 1,
  },
  {
    ...jwtCredential({
      id: credentialIds.stagingAdmin,
      clusterName: 'staging-eu-1',
      name: 'fleet-admin',
      sa: 'fleetconsole/fleet-admin',
      issuedDaysAgo: 70,
      inspectNamespaces: ['team-a', 'team-b'],
      expiresAt: null,
      lastTest: { testedAt: daysAgo(3), succeeded: true, failedStep: null, headline: 'clusterAdmin' },
      testScenario: 'admin',
    }),
    description: 'Legacy long-lived token (no expiry).',
    rotatedAt: daysAgo(30),
    rotatedBy: 'carol',
    version: 2,
  },
  jwtCredential({
    id: credentialIds.dev1Edit,
    clusterName: 'dev-1',
    name: 'fleet-edit',
    sa: 'fleetconsole/fleet-edit',
    issuedDaysAgo: 50,
    expiresAt: daysFromNow(180),
    lastTest: { testedAt: daysAgo(4), succeeded: false, failedStep: 'reachability', headline: null },
    testScenario: 'tlsFailure',
  }),
  jwtCredential({
    id: credentialIds.dev2View,
    clusterName: 'dev-2',
    name: 'fleet-view',
    sa: 'fleetconsole/fleet-view',
    issuedDaysAgo: 40,
    expiresAt: daysFromNow(320),
    lastTest: null,
    testScenario: 'view',
  }),
  jwtCredential({
    id: credentialIds.lab1Edit,
    clusterName: 'lab-1',
    name: 'fleet-edit',
    sa: 'fleetconsole/fleet-edit',
    issuedDaysAgo: 20,
    expiresAt: daysFromNow(300),
    lastTest: null,
    testScenario: 'edit',
  }),
];
