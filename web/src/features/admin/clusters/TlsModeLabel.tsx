import { Label } from '@patternfly/react-core';
import type { ClusterTlsMode } from '@/shared/api';

/** Text of each TLS mode (CLU-3); exported for filters and detail pages. */
export const TLS_MODE_TEXT: Record<ClusterTlsMode, string> = {
  caBundle: 'CA bundle',
  systemTrust: 'System trust',
  skipVerify: 'TLS not verified',
};

/**
 * How a cluster's API server certificate is verified (CLU-3). `skipVerify` is a warning label ("TLS not verified")
 * so an insecure cluster stands out in the fleet list; the other modes are neutral.
 */
export function TlsModeLabel({ tlsMode }: { tlsMode: ClusterTlsMode }) {
  return (
    <Label
      isCompact
      color={tlsMode === 'skipVerify' ? 'orange' : 'grey'}
      status={tlsMode === 'skipVerify' ? 'warning' : undefined}
    >
      {TLS_MODE_TEXT[tlsMode]}
    </Label>
  );
}
