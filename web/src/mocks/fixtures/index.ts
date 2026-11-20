// Typed, realistic fixtures of the mock backend (ADR-0016). They seed `db.ts` and double as test data.
export { auditFixtures, AUDIT_FIXTURE_COUNT } from './audit';
export { clusterFixtures, FAKE_CA_BUNDLE } from './clusters';
export {
  connectionTestAuthFailure,
  connectionTestFor,
  connectionTestPassed,
  connectionTestTlsFailure,
  connectionTestWithNamespaceRules,
} from './connectionTests';
export { credentialFixtures, credentialIds } from './credentials';
export { grantFixtures, grantIds } from './grants';
export { fingerprintOf, mockGuid } from './ids';
export { systemInfoFixture } from './system';
export { ONE_DAY_MS } from './time';
export type * from './types';
export { ADMIN_GROUP_SOURCE, userFixtures } from './users';
