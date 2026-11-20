import type { DefaultError, UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { describe, expectTypeOf, it } from 'vitest';
import type { ApiError } from './errors';

// Compile-time checks (enforced by `npm run typecheck`): the module augmentation in `queryRegister.ts` is in effect.
describe('TanStack Query default error type', () => {
  it('is ApiError for queries and mutations without explicit generics', () => {
    expectTypeOf<DefaultError>().toEqualTypeOf<ApiError>();
    expectTypeOf<UseQueryResult<string>['error']>().toEqualTypeOf<ApiError | null>();
    expectTypeOf<UseMutationResult<void>['error']>().toEqualTypeOf<ApiError | null>();
  });
});
