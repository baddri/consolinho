# 0016 — Contract-first API types and an MSW mock backend for frontend work
**Status:** Accepted (2026-11-18) · **Builds on:** 0013 · **Temporary part ends with:** CP1 integration task T-0043

## Context
CLAUDE.md requires admin API types to be generated from the Api's OpenAPI document (QG-4: no hand-written duplicates).
In CP1 the frontend starts while the backend endpoints are still being built (T-0015..T-0021, waves W5–W7); the
contract (`docs/specs/CP1-api-contract.md`) is fixed first. Frontend work must never block on backend tasks, and the
backend tasks regenerate `web/src/shared/api/schema.gen.ts` as their endpoints land, so `schema.gen.ts` grows
path-by-path during the checkpoint.

## Decision
1. **Provisional contract types.** `web/src/shared/api/schema.contract.ts` is a hand-written transcription of the CP1
   contract **in openapi-typescript's output format** (`paths`, `components.schemas`, `operations`), with schema names
   as the Api will publish them (C# record name minus `Dto`; enums as string unions named like the C# enum). It is the
   only hand-written API type file and is deleted by T-0043.
2. **Generated wins, path by path.** `shared/api/schema.ts` exports the types every caller uses:
   `paths = PreferGenerated<GeneratedPaths, ContractPaths>` and `schemas = PreferGenerated<GeneratedSchemas,
   ContractSchemas>`, where `PreferGenerated<G, C>` takes each key from `G` when present, otherwise from `C`. As backend
   tasks regenerate `schema.gen.ts`, real types replace provisional ones automatically; a contract deviation surfaces
   as a **type error in frontend code**, i.e. early. `apiClient` is `createClient<paths>` over this merged type.
   Named aliases (`UserDetail`, `AccessMode`, …) are exported from `shared/api/types.ts`; features never index
   `components['schemas']` themselves.
3. **Mock backend = MSW handlers built from the same types.** `web/src/mocks/` (new boundary element, may import
   `shared/` only) contains:
   - `fixtures/` — typed, realistic fixtures (the DevOAuth users `admin`, `alice`, `bob`, `ines`; 6+ clusters across
     environments incl. a disabled and a skip-TLS one; credentials in every expiry status; grants; audit entries);
   - `db.ts` — a small in-memory store seeded from fixtures with `resetMockDb()`; handlers mutate it, bump `version`,
     enforce the contract's 404/409/400 rules that the UI depends on (version mismatch, name taken, in-use credential,
     duplicate grant, bulk item errors, last admin/self change), and require `X-Console-Request` on non-GET (403
     `Auth.CsrfHeaderMissing`), so UI tests exercise real error paths;
   - `handlers/*.ts` — one file per contract section, typed with **`openapi-msw`** (`createOpenApiHttp<paths>`) so
     paths, params and bodies are checked against the merged types;
   - `session.ts` — the current mock user (default `admin`; tests switch with `setMockUser('alice' | 'ines' | null)`;
     `null` → 401 on authenticated endpoints).
   `src/test/server.ts` uses these handlers; `resetMockDb()` and `setMockUser('admin')` run in `afterEach`.
4. **Optional dev mode without the backend:** `npm run dev:mock` (`vite --mode mock`) starts the MSW **browser**
   worker from `main.tsx` only when `import.meta.env.MODE === 'mock'` (dynamic import → absent from production
   bundles). The worker script lives in `web/msw/` and Vite uses it as `publicDir` only in mock mode, so it never ships.
   Full-page navigations (`/api/auth/login`) are not intercepted by MSW; mock mode therefore starts signed in and the
   mock user is chosen with `VITE_MOCK_USER`.
5. **Integration (T-0043)** regenerates `schema.gen.ts` from the running Api, deletes `schema.contract.ts` and the
   merge, fixes any drift in features and fixtures, and runs the CP1 demo against the real backend.

## Consequences
- Every task that regenerates `schema.gen.ts` must also run `cd web && npm run typecheck`; a failure is a contract
  deviation to raise with the architects (fix the backend to match the contract, or record a frontend drift fix).
- Hand-written types exist temporarily; QG-4 holds at CP1 close.
- Fixtures double as documentation of realistic data and are reused by CP2+ tests.
