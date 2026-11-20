import type { ApiError } from './errors';

// Every query/mutation function in the app goes through `unwrap()`/`unwrapNoContent()`, which only ever throw an
// `ApiError` (ADR-0015). Registering it as TanStack Query's default error type makes `error` typed `ApiError | null`
// in every `useQuery`/`useMutation` without per-hook generics or casts. Calling a query function that throws anything
// else is a bug; `isApiError` remains the runtime check where `unknown` errors arrive (e.g. global cache hooks).
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
  }
}
