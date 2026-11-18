import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { DEFAULT_MOCK_USER, resetMockDb, setMockUser } from '@/mocks';
import { server } from './server';

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
