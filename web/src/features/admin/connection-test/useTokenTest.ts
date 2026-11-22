import { useCallback, useState } from 'react';
import { isAbortError, type ConnectionTestResult } from '@/shared/api';
import { useTestToken } from './api';
import { useTestCancellation } from './useTestCancellation';

/** Result of {@link useTokenTest}. */
export interface TokenTest {
  /** Result of the latest completed test of the typed token; `null` = untested (or cleared). */
  result: ConnectionTestResult | null;
  isTesting: boolean;
  /** The admin cancelled the latest test ("Test cancelled." is announced); reset by the next run or a token edit. */
  isCancelled: boolean;
  /** Tests `token`; resolves when done or cancelled, rejects with the `ApiError` of a failed request. */
  run: (token: string) => Promise<void>;
  /** Aborts a running test ("Cancel test"); the previous result stays cleared. */
  cancel: () => void;
  /** Forgets the result and aborts a running test — call whenever the typed token changes. */
  clear: () => void;
}

/**
 * "Test new token" of the rotate dialog (CRED-5): runs `test-token` for an unsaved token with the rotated credential's
 * id (for grant hints) and keeps only the **result** — never the token, which stays in the form (CRED-2). Cancelling,
 * clearing and unmounting abort the request; nothing retries.
 */
export function useTokenTest(clusterName: string, credentialId: string | null): TokenTest {
  const testToken = useTestToken(clusterName);
  const cancellation = useTestCancellation();
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  const run = useCallback(
    async (token: string) => {
      setResult(null);
      setIsCancelled(false);
      setIsTesting(true);
      try {
        setResult(await testToken({ token, credentialId, inspectNamespaces: [], signal: cancellation.start() }));
      } catch (error) {
        if (!isAbortError(error)) throw error;
      } finally {
        setIsTesting(false);
      }
    },
    [testToken, credentialId, cancellation],
  );

  const cancel = useCallback(() => {
    cancellation.cancel();
    setIsCancelled(true);
  }, [cancellation]);

  const clear = useCallback(() => {
    cancellation.cancel();
    setResult(null);
    setIsCancelled(false);
  }, [cancellation]);

  return { result, isTesting, isCancelled, run, cancel, clear };
}
