import { expect } from 'vitest';
import { ApiError } from '@/shared/api';

/** Awaits `promise`, asserts it rejected with an {@link ApiError} and returns that error for further assertions. */
export async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}
