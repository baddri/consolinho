import { ApiError } from '@/shared/api';
import { createQueryClient, retryTransientFailures } from './queryClient';

const apiError = (status: number) => new ApiError({ status, title: `HTTP ${status}` });

/** Swallows the expected rejection; the test asserts on the cache's `onError` side effect instead. */
const ignore = () => undefined;

describe('retryTransientFailures', () => {
  it.each([400, 401, 403, 404, 409])('never retries an ApiError %i', (status) => {
    expect(retryTransientFailures(0, apiError(status))).toBe(false);
  });

  it.each([0, 500, 503])('retries a transient ApiError %i once', (status) => {
    expect(retryTransientFailures(0, apiError(status))).toBe(true);
    expect(retryTransientFailures(1, apiError(status))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('calls onUnauthenticated for a 401 from a query or a mutation, and only for 401', async () => {
    const onUnauthenticated = vi.fn();
    const client = createQueryClient({ retry: false, onUnauthenticated });

    await client.query({ queryKey: ['a'], queryFn: () => Promise.reject(apiError(403)) }).catch(ignore);
    expect(onUnauthenticated).not.toHaveBeenCalled();

    await client.query({ queryKey: ['b'], queryFn: () => Promise.reject(apiError(401)) }).catch(ignore);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(apiError(401)) })
      .execute(undefined)
      .catch(ignore);
    expect(onUnauthenticated).toHaveBeenCalledTimes(2);
  });
});
