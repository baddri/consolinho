import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { DEFAULT_MOCK_USER, resetMockDb, setMockUser } from '@/mocks';
import { server } from './server';

// A full-app render first loads the session (`GET /api/auth/me`, ADR-0014) before any page appears; the first render
// in a worker also pays PatternFly's cold start. Under a loaded machine that exceeded Testing Library's 1 s default
// for `findBy*`/`waitFor`, making the first test of a file flaky.
configure({ asyncUtilTimeout: 3000 });

// Any request without a handler fails the test, so tests can never silently hit a real network.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  resetMockDb();
  setMockUser(DEFAULT_MOCK_USER);
});
afterAll(() => server.close());
