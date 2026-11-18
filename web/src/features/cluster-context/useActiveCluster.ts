import { useParams } from 'react-router';

/**
 * Name of the cluster the user is looking at, read from the `:cluster` URL segment.
 *
 * The URL is the only source of truth for the active cluster (no global store), so links are shareable and the
 * value can never drift from what is displayed. Returns `undefined` outside `/c/:cluster/...` routes (e.g. admin).
 */
export function useActiveCluster(): string | undefined {
  return useParams().cluster;
}
