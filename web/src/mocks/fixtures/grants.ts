import { credentialIds } from './credentials';
import { mockGuid } from './ids';
import type { MockGrant } from './types';
import { daysAgo } from './time';

/** Fixture grant ids, for tests that address a grant directly. */
export const grantIds = {
  aliceProdEu: mockGuid(0x201),
  aliceStaging: mockGuid(0x202),
  adminDev1: mockGuid(0x203),
  carolProdEu: mockGuid(0x204),
  carolDev2: mockGuid(0x205),
  daveDev1: mockGuid(0x206),
  inesProdUs: mockGuid(0x207),
  paulProdEu: mockGuid(0x208),
  aliceLab1: mockGuid(0x209),
  adminLab1: mockGuid(0x20a),
  aliceProdK8s: mockGuid(0x20b),
  adminProdK8s: mockGuid(0x20c),
  sreStaging: mockGuid(0x20d),
  ghostTeamStaging: mockGuid(0x20f),
} as const;

/** Builds a user grant record that was never edited. */
function grant(
  id: string,
  username: string,
  clusterName: string,
  credentialId: string,
  accessMode: MockGrant['accessMode'],
  grantedDaysAgo: number,
): MockGrant {
  return {
    id,
    subjectKind: 'user',
    subjectName: username,
    priority: null,
    clusterName,
    credentialId,
    accessMode,
    grantedAt: daysAgo(grantedDaysAgo),
    grantedBy: 'admin',
    updatedAt: null,
    updatedBy: null,
    version: 1,
  };
}

/** Builds a group grant record (with its priority) that was never edited. */
function groupGrant(
  id: string,
  groupName: string,
  clusterName: string,
  credentialId: string,
  accessMode: MockGrant['accessMode'],
  priority: number,
  grantedDaysAgo: number,
): MockGrant {
  return { ...grant(id, groupName, clusterName, credentialId, accessMode, grantedDaysAgo), subjectKind: 'group', priority };
}

/**
 * Grants: `alice` on prod-eu-1 (readOnly), staging-eu-1 (readWrite) and the Kubernetes `lab-1` (readOnly); `admin` on
 * dev-1 and `lab-1` (both readWrite; GRANT-6: admins see only their own grants in the switcher), so both an OpenShift
 * and a Kubernetes cluster are reachable in the mock UI (CP3.7 SW-3/THEME). GRANT-5 markers: `carol` on disabled
 * `dev-2`, deactivated `dave` on dev-1, `ines` through the expired prod-us-1 credential. `pending-paul` has readWrite
 * through the view-only prod-eu-1 credential, which makes the TEST-4 "cannot modify workloads" hint appear. The
 * production Kubernetes `prod-k8s-1` is granted to alice (readOnly) and admin (readWrite) for the FND-1 RO/RW paths.
 */
export const grantFixtures: readonly MockGrant[] = [
  grant(grantIds.aliceProdEu, 'alice', 'prod-eu-1', credentialIds.prodEuView, 'readOnly', 60),
  grant(grantIds.aliceStaging, 'alice', 'staging-eu-1', credentialIds.stagingAdmin, 'readWrite', 55),
  grant(grantIds.adminDev1, 'admin', 'dev-1', credentialIds.dev1Edit, 'readWrite', 45),
  grant(grantIds.aliceLab1, 'alice', 'lab-1', credentialIds.lab1Edit, 'readOnly', 20),
  grant(grantIds.adminLab1, 'admin', 'lab-1', credentialIds.lab1Edit, 'readWrite', 20),
  grant(grantIds.aliceProdK8s, 'alice', 'prod-k8s-1', credentialIds.prodK8sEdit, 'readOnly', 15),
  grant(grantIds.adminProdK8s, 'admin', 'prod-k8s-1', credentialIds.prodK8sEdit, 'readWrite', 15),
  grant(grantIds.carolProdEu, 'carol', 'prod-eu-1', credentialIds.prodEuEdit, 'readWrite', 40),
  grant(grantIds.carolDev2, 'carol', 'dev-2', credentialIds.dev2View, 'readOnly', 35),
  grant(grantIds.daveDev1, 'dave', 'dev-1', credentialIds.dev1Edit, 'readOnly', 30),
  grant(grantIds.inesProdUs, 'ines', 'prod-us-1', credentialIds.prodUsView, 'readOnly', 25),
  grant(grantIds.paulProdEu, 'pending-paul', 'prod-eu-1', credentialIds.prodEuView, 'readWrite', 4),
  // CP4.5a group grants. `sre` (alice's recorded group) and `ghost-team` (only in grants: "Not found on host cluster")
  // share staging-eu-1 with distinct priorities (GRP-4); alice's direct grant there wins (PREC-3), so no switcher
  // changes. `platform` (carol's group) is a host group without grants.
  groupGrant(grantIds.sreStaging, 'sre', 'staging-eu-1', credentialIds.stagingAdmin, 'readOnly', 100, 10),
  groupGrant(grantIds.ghostTeamStaging, 'ghost-team', 'staging-eu-1', credentialIds.stagingAdmin, 'readOnly', 50, 8),
];
