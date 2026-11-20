import { useCallback } from 'react';
import { useToast } from '@/shared/ui';
import { credentialGoneTitle } from './credentialText';

/**
 * Warning toast for a credential action answered with 404: the credential (or its cluster) was deleted meanwhile,
 * possibly by another administrator. The dialog closes; the list refetches and drops the row.
 */
export function useCredentialGoneToast() {
  const toast = useToast();
  return useCallback(
    (credential: string, cluster: string) =>
      toast.warning(credentialGoneTitle(credential, cluster), 'It was deleted, possibly by another administrator.'),
    [toast],
  );
}
