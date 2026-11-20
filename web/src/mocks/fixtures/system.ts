import type { SystemInfo } from '@/shared/api';

/** Body of `GET /api/system/info` in the mock backend (the login footer shows it). */
export const systemInfoFixture: SystemInfo = { version: '0.0.0-test', environment: 'Test' };
