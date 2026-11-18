// The default MSW handlers of every test are the stateful mock backend of `src/mocks` (ADR-0016). Colocated tests
// may only import from `src/test/`, so the mock backend's whole public API (handlers, `mockDb`, `setMockUser`,
// fixtures such as `systemInfoFixture` and `credentialIds`) is re-exported here. Tests override single endpoints
// with `server.use(...)`; the db and the persona are reset after each test (`setup.ts`).
export * from '@/mocks';
