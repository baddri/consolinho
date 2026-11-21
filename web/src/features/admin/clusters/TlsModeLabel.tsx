import type { ClusterTlsMode } from '@/shared/api';
import { StatusIconText } from '@/shared/ui';

/** Text of each TLS mode (CLU-3); exported for filters and detail pages. */
export const TLS_MODE_TEXT: Record<ClusterTlsMode, string> = {
  caBundle: 'CA bundle',
  systemTrust: 'System trust',
  skipVerify: 'TLS not verified',
};

/**
 * How a cluster's API server certificate is verified (CLU-3). `skipVerify` is a warning (yellow triangle + "TLS not
 * verified", `UX.md` §5) so an insecure cluster stands out in the fleet list; the other modes are plain text.
 */
export function TlsModeLabel({ tlsMode }: { tlsMode: ClusterTlsMode }) {
  if (tlsMode === 'skipVerify') return <StatusIconText status="warning" text={TLS_MODE_TEXT[tlsMode]} />;
  return <>{TLS_MODE_TEXT[tlsMode]}</>;
}
