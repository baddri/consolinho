import { minutesAgo } from './time';
import type { MockHostGroups } from './types';

/**
 * The host cluster's groups as FleetConsole's host ServiceAccount reads them (ADR-0039): `sre` with alice, bob and the
 * never-registered `zoe`; `platform` (carol); `auditors` (ines); and `system:authenticated`, which the Api never
 * shows (GRP-3). Recorded membership (`MockUser.groups`) is separate and drives access (PREC-1): bob is on the host
 * `sre` group but has no recorded groups, so he still has no clusters (SW-4).
 */
export const hostGroupsFixture: MockHostGroups = {
  status: 'ok',
  readAt: minutesAgo(1),
  groups: [
    { name: 'sre', users: ['alice', 'bob', 'zoe'] },
    { name: 'platform', users: ['carol'] },
    { name: 'auditors', users: ['ines'] },
    { name: 'system:authenticated', users: ['admin', 'alice', 'bob', 'carol', 'ines'] },
  ],
};
