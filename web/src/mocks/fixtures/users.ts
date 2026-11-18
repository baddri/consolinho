import type { MockUser } from './types';
import { daysAgo, minutesAgo } from './time';

/** Configuration source of the dev admin group (contract §11: `Auth:AdminGroups = ["fleetconsole-admins"]`). */
export const ADMIN_GROUP_SOURCE = 'group fleetconsole-admins';

/**
 * Users of the mock backend, one per persona the UI must handle:
 * - `admin`: admin via configuration only (`isAdminByAssignment: false`) — Promote is offered, Demote refused (USR-6);
 * - `carol`: admin by assignment only;
 * - `alice`: SRE with grants on `prod-eu-1` (readOnly) and `staging-eu-1` (readWrite);
 * - `bob`: no groups, no grants (SW-4 "no clusters");
 * - `ines`: read-only admin (auditor, ADM-2);
 * - `pending-paul`: pre-created, never logged in;
 * - `dave`: deactivated.
 */
export const userFixtures: readonly MockUser[] = [
  {
    username: 'admin',
    displayName: 'Fleet Admin',
    isAdminByAssignment: false,
    adminConfigurationSource: ADMIN_GROUP_SOURCE,
    status: 'active',
    isReadOnly: false,
    lastLoginAt: minutesAgo(5),
    groups: ['fleetconsole-admins'],
    createdAt: daysAgo(120),
    createdBy: 'admin',
    version: 3,
  },
  {
    username: 'carol',
    displayName: 'Carol Operator',
    isAdminByAssignment: true,
    adminConfigurationSource: null,
    status: 'active',
    isReadOnly: false,
    lastLoginAt: daysAgo(1),
    groups: ['platform'],
    createdAt: daysAgo(90),
    createdBy: 'admin',
    version: 4,
  },
  {
    username: 'alice',
    displayName: 'Alice Example',
    isAdminByAssignment: false,
    adminConfigurationSource: null,
    status: 'active',
    isReadOnly: false,
    lastLoginAt: minutesAgo(42),
    groups: ['sre'],
    createdAt: daysAgo(80),
    createdBy: 'alice',
    version: 2,
  },
  {
    username: 'bob',
    displayName: null,
    isAdminByAssignment: false,
    adminConfigurationSource: null,
    status: 'active',
    isReadOnly: false,
    lastLoginAt: daysAgo(3),
    groups: [],
    createdAt: daysAgo(30),
    createdBy: 'bob',
    version: 1,
  },
  {
    username: 'ines',
    displayName: 'Ines Auditor',
    isAdminByAssignment: true,
    adminConfigurationSource: null,
    status: 'active',
    isReadOnly: true,
    lastLoginAt: daysAgo(2),
    groups: ['auditors'],
    createdAt: daysAgo(60),
    createdBy: 'admin',
    version: 5,
  },
  {
    username: 'pending-paul',
    displayName: null,
    isAdminByAssignment: false,
    adminConfigurationSource: null,
    status: 'pending',
    isReadOnly: false,
    lastLoginAt: null,
    groups: [],
    createdAt: daysAgo(4),
    createdBy: 'carol',
    version: 1,
  },
  {
    username: 'dave',
    displayName: 'Dave Former',
    isAdminByAssignment: false,
    adminConfigurationSource: null,
    status: 'deactivated',
    isReadOnly: false,
    lastLoginAt: daysAgo(45),
    groups: ['sre'],
    createdAt: daysAgo(200),
    createdBy: 'admin',
    version: 6,
  },
];
