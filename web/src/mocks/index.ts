// Public API of the MSW mock backend (ADR-0016). Consumers: `test/` (Vitest) and `app/main.tsx` in mock mode.
export { handlers, http, encodeAuditCursor } from './handlers';
export { mockDb, resetMockDb, type MockDb } from './db';
export { DEFAULT_MOCK_USER, getMockUser, setMockUser } from './session';
export { problem, validationProblem, type FieldErrors, type ProblemInit } from './problem';
export * from './fixtures';
export { mockK8s, type StoreChange } from './k8s';
