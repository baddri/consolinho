import { useCallback } from 'react';
import type { Credential } from '@/shared/api';
import { useToast } from '@/shared/ui';
import { OPAQUE_TOKEN_DETAIL, OPAQUE_TOKEN_TITLE } from './ServiceAccountCell';

/**
 * Toasts after a token was saved (add or rotate): the success `title` — which never contains the token (CRED-2) — and,
 * for an opaque (non-JWT) token, the Q10 warning that expiry is unknown and the token is tied to a person.
 */
export function useCredentialSavedToast() {
  const toast = useToast();
  return useCallback(
    (credential: Pick<Credential, 'tokenType'>, title: string) => {
      toast.success(title);
      if (credential.tokenType === 'opaque') toast.warning(OPAQUE_TOKEN_TITLE, OPAQUE_TOKEN_DETAIL);
    },
    [toast],
  );
}
