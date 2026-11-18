import { http, HttpResponse } from 'msw';
import type { SystemInfo } from '@/shared/api';

/** Fixture returned by the default `GET /api/system/info` handler. */
export const systemInfoFixture: SystemInfo = { version: '0.0.0-test', environment: 'Test' };

/**
 * Default MSW handlers: a healthy backend. Tests override individual endpoints with `server.use(...)`.
 * Paths are prefixed with a wildcard so they match regardless of the jsdom origin.
 */
export const handlers = [http.get('*/api/system/info', () => HttpResponse.json(systemInfoFixture))];
